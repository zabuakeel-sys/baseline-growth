import { SOURCES } from '@/lib/followup';
import ActionForm from '../ActionForm';

/** The quick form for logging an inquiry the moment it comes in. */
export default function AddLeadForm({ action, users, defaultAssignee, today, clients }: {
  action: (formData: FormData) => Promise<{ error?: string }>;
  users: { id: number; name: string }[];
  defaultAssignee: number;
  today: string;
  clients?: { id: number; name: string }[];
}) {
  return (
    <ActionForm className="grid" action={action}>
      {clients && (
        <label>Client
          <select name="client_id" required defaultValue="">
            <option value="" disabled>Pick a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label>Name or business<input name="name" required /></label>
      <label>Phone<input name="phone" type="tel" /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Came in by
        <select name="source" defaultValue="">
          <option value="">Not sure</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Came in on<input name="received_on" type="date" defaultValue={today} max={today} /></label>
      <label>Who follows up
        <select name="assignee_id" defaultValue={defaultAssignee}>
          <option value="">Nobody yet</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="full">What they want<input name="need" placeholder="Nightly cleaning for a 20,000 sq ft office" /></label>
      <div className="actions full"><button type="submit">Add inquiry</button></div>
    </ActionForm>
  );
}
