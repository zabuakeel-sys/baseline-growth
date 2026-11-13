import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { openTasks, today } from '@/lib/work';
import TaskList from './TaskList';

export const dynamic = 'force-dynamic';

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const user = await requireUser();
  const mine = (await searchParams).who !== 'all';
  const tasks = await openTasks(mine ? { assigneeId: user.id } : {});
  const now = today();
  const weekEnd = addDays(now, 7);
  const late = tasks.filter((t) => t.due_on && t.due_on < now);
  const thisWeek = tasks.filter((t) => t.due_on && t.due_on >= now && t.due_on <= weekEnd);
  const later = tasks.filter((t) => !t.due_on || t.due_on > weekEnd);
  const back = mine ? '/work' : '/work?who=all';

  return (
    <>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1>This week</h1>
          <p className="sub" style={{ margin: 0 }}>The work that grows client revenue. Tap the box when a task is done.</p>
        </div>
        <div className="segmented" role="group" aria-label="Whose tasks">
          <Link href="/work" aria-current={mine ? 'true' : undefined}>Mine</Link>
          <Link href="/work?who=all" aria-current={!mine ? 'true' : undefined}>Everyone</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Late</div><div className="value">{late.length}</div></div>
        <div className="stat"><div className="label">Due in the next 7 days</div><div className="value">{thisWeek.length}</div></div>
        <div className="stat"><div className="label">Later</div><div className="value">{later.length}</div></div>
      </div>

      {tasks.length === 0 && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>
          Nothing open.
        </p></div>
      )}
      {late.length > 0 && <section className="card"><h2>Late</h2><TaskList tasks={late} back={back} showClient today={now} /></section>}
      {thisWeek.length > 0 && <section className="card"><h2>Due in the next 7 days</h2><TaskList tasks={thisWeek} back={back} showClient today={now} /></section>}
      {later.length > 0 && <section className="card"><h2>Later</h2><TaskList tasks={later} back={back} showClient today={now} /></section>}
    </>
  );
}
