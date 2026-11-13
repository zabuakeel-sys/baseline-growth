import Link from 'next/link';
import type { Task } from '@/lib/work';
import { toggleTask } from './actions';

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Tasks with a one-tap done/undo button. `back` is where to return after the tap. */
export default function TaskList({ tasks, back, showClient, today }: { tasks: Task[]; back: string; showClient: boolean; today: string }) {
  return (
    <ul className="tasks">
      {tasks.map((t) => {
        const late = !t.done_at && t.due_on !== null && t.due_on < today;
        return (
          <li key={t.id} className={t.done_at ? 'done' : ''}>
            <form action={toggleTask.bind(null, t.id, back)}>
              <button type="submit" className="tick" aria-label={t.done_at ? `Reopen: ${t.title}` : `Mark done: ${t.title}`}>
                {t.done_at ? '✓' : ''}
              </button>
            </form>
            <div className="task-body">
              <div className="task-title">{t.title}</div>
              <div className="task-meta">
                {showClient && <><Link href={`/clients/${t.client_id}`}>{t.client_name}</Link> · </>}
                {t.due_on ? <span className={late ? 'late' : ''}>{late ? 'Late, was due ' : 'Due '}{shortDate(t.due_on)}</span> : 'No due date'}
                {t.assignee_name && <> · {t.assignee_name}</>}
                {t.area && <> · {t.area}</>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
