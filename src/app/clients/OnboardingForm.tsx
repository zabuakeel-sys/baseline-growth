import { QUESTIONS } from '@/lib/onboarding';
import ActionForm from '../ActionForm';
import CopyButton from '../leads/CopyButton';

type Answers = Record<string, unknown> & { objections?: { said: string; answer: string }[] };

/** The questions to ask a business owner, with a field for each answer. */
export default function OnboardingForm({ action, answers, editing, filled, fromSite }: {
  action: (fd: FormData) => Promise<{ error?: string }>;
  answers?: Answers | null;
  editing: boolean;
  filled?: string[];  // answers drafted from their website
  fromSite?: boolean; // sign-up started from the website: ask the owner only what the site cannot say
}) {
  const sections = [...new Set(QUESTIONS.map((q) => q.section))];
  const asText = fromSite
    ? QUESTIONS.filter((q) => q.owner).map((q) => `- ${q.ask}`).join('\n')
    : sections.map((s) => `${s}\n${QUESTIONS.filter((q) => q.section === s).map((q) => `- ${q.ask}`).join('\n')}`).join('\n\n');
  const tag = (key: string) => filled?.includes(key)
    ? <span className="pill from-site">From their website, check it</span>
    : fromSite && QUESTIONS.find((q) => q.key === key)?.owner && !val(key)
      ? <span className="pill ask-owner">{QUESTIONS.find((q) => q.key === key)?.section === 'Our deal' && key !== 'mailing_address' ? 'From your agreement' : 'Ask the owner'}</span>
      : null;
  const val = (k: string) => (answers?.[k] == null ? '' : String(answers[k]));
  const pairs = answers?.objections ?? [];
  return (
    <>
      {!editing && fromSite && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>Only the owner can answer these</strong> (marked &quot;Ask the owner&quot; below): who gets interested customers, what a customer is worth,
            who not to contact, whether reps can visit, the mailing address, and your deal. Ask on a call or send them the list.
          </p>
          <CopyButton text={asText} />
        </div>
      )}
      {!editing && !fromSite && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <strong>Ask the owner these questions</strong> on a call or in person, then fill in their answers below. Or send them the
            list. Everything else (searches, script, outreach, who calls whom) is set up from the answers.
          </p>
          <CopyButton text={asText} />
        </div>
      )}
      <ActionForm action={action}>
        {sections.map((section) => (
          <fieldset key={section} className="card area">
            <legend>{section}</legend>
            <div className="grid">
              {QUESTIONS.filter((q) => q.section === section).map((q) => q.pairs ? (
                <div key={q.key} className="full">
                  <p style={{ margin: '0 0 4px' }}><strong>{q.ask}</strong> {tag('objections')}</p>
                  <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{q.why}</p>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 8 }}>
                      <label>They say<input name={`objection${i}`} defaultValue={pairs[i - 1]?.said ?? ''} placeholder={i === 1 ? 'We already have someone' : ''} /></label>
                      <label>Your answer<input name={`answer${i}`} defaultValue={pairs[i - 1]?.answer ?? ''} placeholder={i === 1 ? 'Most of our customers did too; what would you change?' : ''} /></label>
                    </div>
                  ))}
                </div>
              ) : (
                <label key={q.key} className={q.multiline || q.key === 'offer' || q.key === 'mailing_address' ? 'full' : ''}>
                  <span><strong style={{ color: 'var(--ink)' }}>{q.ask}</strong>{q.required ? ' *' : ''} {tag(q.key)}</span>
                  <span style={{ fontSize: 12 }}>{q.why}</span>
                  {q.choices
                    ? <select name={q.key} defaultValue={val(q.key) || q.choices[0][0]}>{q.choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    : q.multiline
                    ? <textarea name={q.key} defaultValue={val(q.key)} rows={3} />
                    : <input name={q.key} defaultValue={val(q.key)} type={q.date ? 'date' : 'text'} inputMode={q.money || q.percent ? 'decimal' : q.whole ? 'numeric' : undefined} />}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="card">
          {!editing && (
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="save_terms" defaultChecked style={{ minHeight: 0 }} /> Use these deal terms as my standard for the next business
            </label>
          )}
          {editing && (
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="rewrite_script" style={{ minHeight: 0 }} /> Rewrite the sales script from these answers (replaces edits made to it)
            </label>
          )}
          <div className="actions"><button type="submit">{editing ? 'Save answers' : 'Set up this business'}</button></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>* needed before the system can work for them.</p>
        </div>
      </ActionForm>
    </>
  );
}
