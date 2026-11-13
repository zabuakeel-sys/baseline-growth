import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCheckup } from '@/lib/checkups';
import { AREAS, buildPlan, scoreCheckup } from '@/lib/checkup';
import { APP_NAME } from '@/lib/config';
import PrintButton from './PrintButton';
import ActionForm from '../../ActionForm';
import { planToTasks } from '../../work/actions';

export const dynamic = 'force-dynamic';

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function CheckupResultPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const checkup = await getCheckup(id);
  if (!checkup) notFound();

  const { scores, focus, overall } = scoreCheckup(checkup.answers);
  const plan = buildPlan(focus);
  const focusAreas = focus.map((k) => AREAS.find((a) => a.key === k)!);

  return (
    <>
      <p className="no-print"><Link href={`/clients/${checkup.client_id}`}>Back to {checkup.client_name}</Link></p>
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>{APP_NAME} · Revenue Checkup</p>
          <h1>{checkup.client_name}</h1>
          <p className="sub" style={{ margin: 0 }}>
            {longDate(checkup.conducted_on)}{checkup.conducted_by_name ? ` · with ${checkup.conducted_by_name}` : ''}
          </p>
        </div>
        <div className="no-print"><PrintButton /></div>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="where-h">
        <h2 id="where-h">
          {focusAreas.length === 0
            ? 'No single area is holding revenue back'
            : `Revenue is stuck at: ${focusAreas.map((a) => a.name.toLowerCase()).join(' and ')}`}
        </h2>
        <p style={{ marginTop: 0 }}>
          {focusAreas.length === 0
            ? 'Every area scored 75 or higher. Growth here comes from doing more of what already works; plan it together rather than from this checkup.'
            : focusAreas.map((a) => a.problem).join(' ')}
        </p>
        <div className="meters" role="list" aria-label={`Scores out of 100, overall ${overall}`}>
          {scores.map((s) => {
            const isFocus = focus.includes(s.key);
            return (
              <div key={s.key} className="meter" role="listitem" aria-label={`${s.name}: ${s.score} out of 100${isFocus ? ', focus area' : ''}`}>
                <div className="meter-label">
                  <span className={isFocus ? 'strong' : ''}>{s.name}</span>
                  {isFocus && <span className="tag">Focus</span>}
                </div>
                <div className="meter-track"><div className={`meter-fill${isFocus ? ' focus' : ''}`} style={{ width: `${Math.max(s.score, 1)}%` }} /></div>
                <div className="meter-value">{s.score}</div>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>Scores run 0 to 100, from how true each statement was today. Overall: {overall}.</p>
      </section>

      {focusAreas.length > 0 && (
        <section className="card" aria-labelledby="plan-h">
          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 id="plan-h" style={{ margin: 0 }}>90-day plan</h2>
            <div className="no-print">
              {checkup.tasks_created_at ? (
                <Link href={`/clients/${checkup.client_id}#tasks-h`}>In the task list</Link>
              ) : (
                <ActionForm action={planToTasks.bind(null, checkup.id)}>
                  <button type="submit">Add plan to tasks</button>
                </ActionForm>
              )}
            </div>
          </div>
          {plan.map((m) => m.items.length > 0 && (
            <div key={m.month} className="plan-month">
              <h3>Month {m.month}</h3>
              <ol>
                {m.items.map((item, i) => (
                  <li key={i}>{item.action}{focusAreas.length > 1 && <span className="muted"> ({item.area})</span>}</li>
                ))}
              </ol>
            </div>
          ))}
          <p className="muted" style={{ marginBottom: 0 }}>
            Progress is measured against the signed baseline: monthly revenue, inquiries, close rate, average sale and repeat rate.
          </p>
        </section>
      )}

      {(checkup.summary || Object.keys(checkup.notes).length > 0) && (
        <section className="card" aria-labelledby="notes-h">
          <h2 id="notes-h">What we heard</h2>
          {checkup.summary && <p style={{ marginTop: 0 }}><strong>{checkup.summary}</strong></p>}
          {AREAS.filter((a) => checkup.notes[a.key]).map((a) => (
            <div key={a.key} style={{ marginBottom: 12 }}>
              <h3>{a.name}</h3>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{checkup.notes[a.key]}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
