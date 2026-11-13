// Live call coach: given what has been said so far, suggests the rep's next line.
// Uses Claude when an Anthropic credential is configured (ANTHROPIC_API_KEY on the server);
// otherwise, or if the call fails, falls back to matching objections against the client's script.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { OBJECTIONS, detectObjections, scriptAnswer } from './playbook';

export type Suggestion = { say: string; objection: string; why: string; source: 'ai' | 'script' };

export const coachConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const Output = z.object({
  say: z.string(),
  objection: z.enum(['none', ...OBJECTIONS.map((o) => o.key)] as [string, ...string[]]),
  why: z.string(),
});

const SYSTEM = `You are a sales coach listening to a live phone call through a speakerphone. You see a rough, unlabeled transcript: the rep and the prospect are mixed together, words may be misheard, and it may stop mid-sentence.

Suggest the single best thing for the rep to say next, as words they can say out loud: one or two short sentences, plain and friendly, never pushy.

Rules:
- Stay inside the client's offer and script. Never invent prices, guarantees, numbers, features, or facts that are not in the context.
- If the prospect raised an objection, answer it, using the script's answer when there is one.
- Move toward one small next step: a meeting, a walkthrough, or a sign-up.
- If the prospect clearly asked not to be contacted or is firmly not interested, suggest a polite close and thank them.
- "why" is one short line for the rep explaining the move.`;

let client: Anthropic | null = null;

export async function suggestNext(ctx: {
  transcript: string; clientName: string; offer: string; script: string; brief: string[];
}): Promise<Suggestion> {
  const heard = ctx.transcript.slice(-4000);
  const fallback = (): Suggestion => {
    const objections = detectObjections(heard.slice(-600));
    const key = objections[objections.length - 1];
    const answer = key ? scriptAnswer(ctx.script, key) : '';
    const label = OBJECTIONS.find((o) => o.key === key)?.label;
    return {
      say: answer || (key ? `(No script answer for "${label}" yet. Acknowledge it, ask what matters most to them, and offer a small next step.)`
        : 'Ask what they would change about how this is handled today, then offer a short next step.'),
      objection: key ?? 'none',
      why: key ? `Heard: ${label}.` : 'No objection heard yet.',
      source: 'script',
    };
  };
  if (!coachConfigured() || !heard.trim()) return fallback();

  client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          `Client: ${ctx.clientName}`,
          `What the client offers: ${ctx.offer || '(not given)'}`,
          `Client's sales script:\n${ctx.script || '(none)'}`,
          `What we know about this prospect:\n${ctx.brief.join('\n')}`,
          `Transcript so far (most recent last):\n${heard}`,
        ].join('\n\n'),
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return fallback();
    const out = response.parsed_output;
    return { say: out.say.trim(), objection: out.objection, why: out.why.trim(), source: 'ai' };
  } catch (err) {
    // A slow or failed call must never leave the rep with nothing to say.
    if (err instanceof Anthropic.APIError) console.error(`call coach API error ${err.status}:`, err.message);
    else console.error('call coach failed:', err);
    return fallback();
  }
}
