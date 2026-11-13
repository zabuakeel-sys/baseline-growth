import { SOURCES } from '@/lib/followup';
import ActionForm from '../ActionForm';

/** Adds a prospect we will reach on a client's behalf. */
export default function AddLeadForm({ action, users, defaultAssignee, clients }: {
  action: (formData: FormData) => Promise<{ error?: string }>;
  users: { id: number; name: string }[];
  defaultAssignee: number;
  clients?: { id: number; name: string }[];
}) {
  return (
    <ActionForm className="grid" action={action}>
      {clients && (
        <label>For client
          <select name="client_id" required defaultValue="">
            <option value="" disabled>Pick a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label>Name or business<input name="name" required /></label>
      <label>Phone<input name="phone" type="tel" /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Found through
        <select name="source" defaultValue="">
          <option value="">Not sure</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Who reaches out
        <select name="assignee_id" defaultValue={defaultAssignee}>
          <option value="">Nobody yet</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <label className="full">Why they might need the client (optional)<input name="need" placeholder="Independent shop with open bays on weekdays" /></label>
      <div className="actions full"><button type="submit">Add prospect</button></div>
    </ActionForm>
  );
}
