import { query } from './db';
import { statement } from './billing';
import type { Baseline, Client } from './clients';

/** Today in Michigan, where the business runs. 'YYYY-MM-DD'. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date());

export const monthLabel = (month: string) =>
  new Date(`${month.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export type Task = {
  id: number; client_id: number; client_name: string; title: string; area: string;
  assignee_id: number | null; assignee_name: string | null; due_on: string | null; done_at: string | null;
};

const TASK_SELECT = `SELECT t.id, t.client_id, c.name AS client_name, t.title, t.area, t.assignee_id,
  u.name AS assignee_name, t.due_on, t.done_at
  FROM tasks t JOIN clients c ON c.id = t.client_id LEFT JOIN users u ON u.id = t.assignee_id`;

export async function openTasks(opts: { assigneeId?: number } = {}) {
  const params: unknown[] = [];
  let where = 'WHERE t.done_at IS NULL';
  if (opts.assigneeId) { params.push(opts.assigneeId); where += ` AND t.assignee_id = $1`; }
  const { rows } = await query<Task>(`${TASK_SELECT} ${where} ORDER BY t.due_on NULLS LAST, t.id`, params);
  return rows;
}

export async function clientTasks(clientId: number) {
  const { rows } = await query<Task>(
    `${TASK_SELECT} WHERE t.client_id = $1 ORDER BY (t.done_at IS NOT NULL), t.due_on NULLS LAST, t.done_at DESC, t.id`,
    [clientId],
  );
  return rows;
}

export async function listUsers() {
  const { rows } = await query<{ id: number; name: string }>('SELECT id, name FROM users ORDER BY name');
  return rows;
}

export type MonthlyResult = {
  client_id: number; month: string; revenue_cents: number; inquiries: number | null;
  new_customers: number | null; notes: string; confirmed: boolean; confirmed_by: string;
};

export async function clientResults(clientId: number) {
  const { rows } = await query<MonthlyResult>(
    'SELECT * FROM monthly_results WHERE client_id = $1 ORDER BY month DESC', [clientId]);
  return rows;
}

export type Payment = { id: number; client_id: number; month: string; amount_cents: number; received_on: string; note: string };

/** Every billed client with its statement, for the money page. */
export async function allStatements() {
  const clients = (await query<Client>(
    "SELECT * FROM clients WHERE contract_start IS NOT NULL AND status <> 'prospect' ORDER BY name")).rows;
  if (!clients.length) return [];
  const ids = clients.map((c) => c.id);
  const baselines = (await query<Baseline>('SELECT * FROM baselines WHERE client_id = ANY($1)', [ids])).rows;
  const results = (await query<MonthlyResult>('SELECT * FROM monthly_results WHERE client_id = ANY($1)', [ids])).rows;
  const payments = (await query<Payment>('SELECT * FROM payments WHERE client_id = ANY($1)', [ids])).rows;
  const now = today();
  return clients.map((client) => ({
    client,
    rows: statement({
      client,
      baseline: baselines.find((b) => b.client_id === client.id) ?? null,
      results: results.filter((r) => r.client_id === client.id),
      payments: payments.filter((p) => p.client_id === client.id),
      today: now,
    }),
  }));
}

export async function clientStatement(client: Client, baseline: Baseline | null) {
  const results = (await query<MonthlyResult>('SELECT * FROM monthly_results WHERE client_id = $1', [client.id])).rows;
  const payments = (await query<Payment>('SELECT * FROM payments WHERE client_id = $1', [client.id])).rows;
  return statement({ client, baseline, results, payments, today: today() });
}
