// Starts the outreach engine in the background when the server starts: every 5 minutes it
// queues due messages, sends approved ones inside the limits and reads replies.
// Set OUTREACH_BACKGROUND=off to disable (tests, or to run it only from the Outbox page).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.OUTREACH_BACKGROUND === 'off') return;
  if (process.env.MAIL_DEBUG === 'on') {
    const { diagnoseSharedMailbox } = await import('./lib/mail');
    setTimeout(() => { diagnoseSharedMailbox().catch((err) => console.error('[mail-debug] diagnostic failed:', err)); }, 8_000);
  }
  const { runOutreach } = await import('./lib/engine');
  const run = () => runOutreach().catch((err) => console.error('outreach run failed:', err));
  setTimeout(run, 30_000);
  setInterval(run, 5 * 60_000);
}
