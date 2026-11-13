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
const newClient = () => new Anthropic({ timeout: 20_000, maxRetries: 1 });

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

  client ??= newClient();
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

// ---------------------------------------------------------------------------------------------
// Email writing. Both functions return null when no AI is configured or the call fails, and the
// caller falls back to the plain template, so outreach never waits on the AI.

const getClient = () => (client ??= newClient());

const LINE_SYSTEM = `You write the personal first line of a short cold email to a local business, from facts a researcher found about them.

Rules:
- One sentence, under 25 words, friendly and specific to them. It goes right after "Hi <name>," and before the sender says who they are.
- Use ONLY the facts given. Never invent compliments, numbers, awards, history, or anything not stated.
- No flattery words like "amazing" or "impressive", no exclamation marks, no questions.
- If the facts are too thin to say something specific and true, return an empty line.`;

const Line = z.object({ line: z.string() });

/** One true, specific opening sentence about the prospect, or '' when there is nothing specific to say. */
export async function personalLine(facts: {
  name: string; about: string; need: string; rating: number | null; reviews: number | null; city: string; clientName: string; offer: string;
}): Promise<string | null> {
  if (!coachConfigured()) return null;
  try {
    const response = await getClient().messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 1000,
      output_config: { effort: 'low', format: zodOutputFormat(Line) },
      system: LINE_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          `Prospect: ${facts.name}${facts.city ? ` (${facts.city})` : ''}`,
          facts.about && `What we found about them:\n${facts.about.slice(0, 2000)}`,
          facts.need && `What they may need: ${facts.need}`,
          facts.rating != null && `Google rating: ${facts.rating} from ${facts.reviews ?? 0} reviews`,
          `The email is on behalf of ${facts.clientName}: ${facts.offer || '(no offer given)'}`,
        ].filter(Boolean).join('\n\n'),
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const line = response.parsed_output.line.trim().replace(/\s+/g, ' ');
    // Guardrails: one sentence, short, no question or exclamation.
    if (!line || line.length > 200 || /[!?]/.test(line) || /\n/.test(line)) return '';
    return /[.]$/.test(line) ? line : `${line}.`;
  } catch (err) {
    console.error('personal line failed:', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return null;
  }
}

export const INTENTS = {
  wants_meeting: 'Wants to meet or talk',
  question: 'Asked a question',
  send_info: 'Wants information first',
  not_now: 'Not now / later',
  other: 'Other',
} as const;

const REPLY_SYSTEM = `You draft a reply to a prospect who answered a sales email sent on behalf of a client business. A person will read and edit your draft before it is sent.

Rules:
- Short: two to five sentences. Plain, warm, direct. Start with "Hi <first name>," on its own line, then the body. Do not sign off; the signature is added after.
- Answer what they actually asked, using ONLY the client facts given. Never invent prices, guarantees, availability, numbers or features. If they ask something the facts do not answer, say you will find out and get back to them.
- Move toward the client's usual first step, and offer the booking link when there is one.
- If they want a call, ask for a good time and number, or offer two times without stating specific dates.
- "intent" classifies what they want.`;

const Draft = z.object({
  reply: z.string(),
  intent: z.enum(Object.keys(INTENTS) as [keyof typeof INTENTS, ...(keyof typeof INTENTS)[]]),
});

export type ReplyDraft = { reply: string; intent: keyof typeof INTENTS; source: 'ai' | 'template' };

/** A reply for a person to approve. Falls back to a short template when AI is off or fails. */
export async function draftReply(ctx: {
  leadName: string; theyWrote: string; clientName: string; offer: string; whyUs: string; firstStep: string;
  claimUrl: string; script: string; pricing: string;
}): Promise<ReplyDraft> {
  const first = ctx.leadName.trim().split(/\s+/)[0] || 'there';
  const template = (): ReplyDraft => ({
    reply: `Hi ${first},\n\nThanks for getting back to me. ${ctx.firstStep ? `The easiest next step is a ${ctx.firstStep.replace(/^(a|an|the)\s+/i, '').replace(/[.\s]+$/, '')}.` : 'Happy to answer any questions.'}${ctx.claimUrl ? ` You can book here: ${ctx.claimUrl}` : ' What time works for a quick call?'}`,
    intent: 'other', source: 'template',
  });
  if (!coachConfigured()) return template();
  try {
    const response = await getClient().messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Draft) },
      system: REPLY_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          `Prospect's name: ${ctx.leadName}`,
          `Client: ${ctx.clientName}`,
          `What the client offers: ${ctx.offer || '(not given)'}`,
          ctx.whyUs && `Why customers pick them:\n${ctx.whyUs}`,
          ctx.firstStep && `How new customers start: ${ctx.firstStep}`,
          ctx.claimUrl && `Booking link: ${ctx.claimUrl}`,
          ctx.pricing && `Pricing facts:\n${ctx.pricing}`,
          ctx.script && `Client's sales script (for answers to common objections):\n${ctx.script.slice(0, 3000)}`,
          `What the prospect wrote:\n${ctx.theyWrote.slice(0, 3000)}`,
        ].filter(Boolean).join('\n\n'),
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output?.reply.trim()) return template();
    return { reply: response.parsed_output.reply.trim(), intent: response.parsed_output.intent, source: 'ai' };
  } catch (err) {
    console.error('reply draft failed:', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return template();
  }
}
