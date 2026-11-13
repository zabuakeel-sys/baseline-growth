import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { AREAS, RATING_LABELS, fieldName } from '@/lib/checkup';
import { saveCheckup } from '../../../checkups/actions';
import ActionForm from '../../../ActionForm';

export const dynamic = 'force-dynamic';

// Today in Michigan, where the business runs, so a late-evening checkup is not dated tomorrow.
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date());

export default async function CheckupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client } = found;

  return (
    <>
      <p><Link href={`/clients/${id}`}>Back to {client.name}</Link></p>
      <h1>Revenue Checkup: {client.name}</h1>
      <p className="sub">
        Go through this with the owner. For each statement, ask and listen, then rate how true it is today.
        Write down what they say in their own words; it goes into the report.
      </p>

      <ActionForm action={saveCheckup.bind(null, id)}>
        <div className="card">
          <label style={{ maxWidth: 240 }}>Date of checkup<input name="conducted_on" type="date" defaultValue={today()} required /></label>
        </div>

        {AREAS.map((area, n) => (
          <fieldset key={area.key} className="card area">
            <legend><span className="muted">{n + 1} of {AREAS.length}</span> {area.name}</legend>
            <p className="muted" style={{ marginTop: 0 }}>Looking for: {area.problem.charAt(0).toLowerCase() + area.problem.slice(1)}</p>
            {area.statements.map((statement, i) => (
              <div key={i} className="statement" role="radiogroup" aria-label={statement}>
                <p>{statement}</p>
                <div className="scale">
                  {RATING_LABELS.map((label, r) => (
                    <label key={r} className="choice">
                      <input type="radio" name={fieldName(area.key, i)} value={r + 1} required />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <label>What the owner said<textarea name={`notes_${area.key}`} placeholder="Their words, numbers they mentioned, what they have tried" /></label>
          </fieldset>
        ))}

        <div className="card">
          <label>Your summary (optional)<textarea name="summary" placeholder="The one thing that stood out in this conversation" /></label>
          <div className="actions" style={{ marginTop: 12 }}><button type="submit">See results and plan</button></div>
        </div>
      </ActionForm>
    </>
  );
}
