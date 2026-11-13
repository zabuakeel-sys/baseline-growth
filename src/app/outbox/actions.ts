'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner, requireUser } from '@/lib/auth';
import { handOver, runOutreach } from '@/lib/engine';
import { parseWholeNumber } from '@/lib/money';

type Result = { error?: string };
const back = (msg: string): never => redirect(`/outbox?saved=${encodeURIComponent(msg)}`);
const refresh = () => { revalidatePath('/outbox'); revalidatePath('/leads'); };

export async function runNow(): Promise<Result> {
  await requireUser();
  const r = await runOutreach();
  refresh();
  if (!r) return back('A run is already in progress; try again in a minute');
  return back(`Run finished: ${r.queued} queued, ${r.sent} sent${r.failed ? `, ${r.failed} failed` : ''}, ${r.read} new emails read${r.notes.length ? `. ${r.notes.join('. ')}` : ''}`);
}

export async function reviewOutbox(formData: FormData): Promise<Result> {
  await requireUser();
  const ids = formData.getAll('ids').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const decision = String(formData.get('decision') ?? '');
  if (!ids.length) return { error: 'Tick at least one message first.' };
  if (decision === 'approve') {
    const r = await query("UPDATE outbox SET status = 'approved', approved_at = now() WHERE id = ANY($1) AND status IN ('pending', 'failed') AND kind = 'sequence'", [ids]);
    refresh();
    return back(`${r.rowCount} approved. They go out on the next run inside sending hours`);
  }
  if (decision === 'cancel') {
    const r = await query("UPDATE outbox SET status = 'cancelled' WHERE id = ANY($1) AND status IN ('pending', 'approved', 'failed')", [ids]);
    refresh();
    return back(`${r.rowCount} cancelled`);
  }
  return { error: 'Pick approve or cancel.' };
}

export async function saveSettings(formData: FormData): Promise<Result> {
  await requireOwner();
  const autoSend = formData.get('auto_send') === 'on';
  const limit = parseWholeNumber(formData.get('daily_limit'));
  const start = parseWholeNumber(formData.get('start_hour'));
  const end = parseWholeNumber(formData.get('end_hour'));
  const searches = parseWholeNumber(formData.get('max_searches_per_day'));
  if (searches === null || Number.isNaN(searches) || searches > 500) return { error: 'Searches per day must be 0 to 500.' };
  if (!limit || Number.isNaN(limit) || limit > 200) return { error: 'Daily limit must be 1 to 200.' };
  if (start === null || end === null || Number.isNaN(start) || Number.isNaN(end) || start >= end || end > 24) {
    return { error: 'Sending hours must be a start hour before the end hour, 0 to 24.' };
  }
  await query('UPDATE outreach_settings SET auto_send = $1, daily_limit = $2, start_hour = $3, end_hour = $4, max_searches_per_day = $5 WHERE id = 1',
    [autoSend, limit, start, end, searches]);
  // Switching to automatic releases what is already waiting for approval.
  // Reply drafts always wait for a person.
  if (autoSend) await query("UPDATE outbox SET status = 'approved', approved_at = now() WHERE status = 'pending' AND kind = 'sequence'");
  refresh();
  return back('Settings saved');
}

/** Emails an interested prospect to the client. */
export async function handOverLead(leadId: number, returnTo: string): Promise<Result> {
  const user = await requireUser();
  try {
    await handOver(leadId, user.name);
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh();
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/leads';
  const [path, hash] = safe.split('#');
  redirect(`${path}${path.includes('?') ? '&' : '?'}saved=${encodeURIComponent('Emailed to the client')}${hash ? `#${hash}` : ''}`);
}

/** Approves an AI reply draft, with the person's edits, and sends it on the next run. */
export async function decideReplyDraft(id: number, formData: FormData): Promise<Result> {
  await requireUser();
  const decision = String(formData.get('decision') ?? '');
  if (decision === 'discard') {
    await query("UPDATE outbox SET status = 'cancelled' WHERE id = $1 AND kind = 'reply' AND status IN ('pending', 'failed')", [id]);
    refresh();
    return back('Draft discarded');
  }
  const body = String(formData.get('body') ?? '').replace(/\r\n/g, '\n').trim();
  if (body.length < 10) return { error: 'The reply is empty.' };
  if (body.length > 10_000) return { error: 'The reply is too long.' };
  const r = await query(
    "UPDATE outbox SET body = $2, status = 'approved', approved_at = now(), error = '' WHERE id = $1 AND kind = 'reply' AND status IN ('pending', 'failed')",
    [id, body]);
  if (!r.rowCount) return { error: 'That draft was already sent or discarded.' };
  // Send right away instead of waiting for the next background run: someone is waiting.
  const run = await runOutreach();
  refresh();
  const sentNow = run && (await query("SELECT 1 FROM outbox WHERE id = $1 AND status = 'sent'", [id])).rowCount;
  return back(sentNow ? 'Reply sent' : 'Reply approved. It goes out on the next run inside sending hours');
}
