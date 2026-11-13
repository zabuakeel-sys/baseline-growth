'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OUTCOMES } from '@/lib/sales';
import { coachCall } from './actions';
import ActionForm from '../ActionForm';

type Suggestion = { say: string; objection: string; why: string; source: 'ai' | 'script' };
type Rec = {
  continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};

/**
 * Listens to a speakerphone call through the device microphone, keeps a running transcript in the
 * page only (no audio is recorded or stored), and asks for the next best line as the call goes.
 * Starts only after the rep confirms the prospect agreed to the note-taker.
 */
export default function CallAssistant({ leadId, logAction }: { leadId: number; logAction: (fd: FormData) => Promise<{ error?: string } | void> }) {
  const [consent, setConsent] = useState(false);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef<Rec | null>(null);
  const wantOn = useRef(false);
  const lastAsk = useRef(0);
  const linesRef = useRef<string[]>([]);
  linesRef.current = lines;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { wantOn.current = false; rec.current?.stop(); };
  }, []);

  const ask = useCallback(async (extra = '') => {
    const transcript = [...linesRef.current, extra].filter(Boolean).join('\n');
    if (!transcript.trim()) return;
    lastAsk.current = Date.now();
    setBusy(true);
    setError('');
    const r = await coachCall(leadId, transcript);
    setBusy(false);
    if ('error' in r) setError(r.error);
    else setSuggestion(r);
  }, [leadId]);

  const start = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const text = res[0].transcript.trim();
          if (text) {
            setLines((prev) => [...prev, text]);
            // Ask for a new line at natural pauses, at most every 8 seconds.
            if (Date.now() - lastAsk.current > 8000) setTimeout(() => ask(), 50);
          }
        } else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantOn.current = false;
        setError('Microphone access was blocked. Allow it in the browser to use the listener.');
      }
    };
    // Browsers stop listening after a silence; restart while the rep wants it on.
    r.onend = () => { if (wantOn.current) { try { r.start(); } catch { /* already started */ } } else setListening(false); };
    rec.current = r;
    wantOn.current = true;
    r.start();
    setListening(true);
  };
  const stop = () => { wantOn.current = false; rec.current?.stop(); setListening(false); setInterim(''); };

  const transcriptText = lines.join('\n');

  return (
    <div className="call">
      {!consent ? (
        <div className="card warn-card">
          <p style={{ marginTop: 0 }}><strong>Ask first.</strong> Before turning the listener on, say something like:</p>
          <p className="script-line">&ldquo;I use a note-taker on my calls so I don&apos;t miss anything. Is that okay with you?&rdquo;</p>
          <p className="muted" style={{ fontSize: 13 }}>Some states require everyone on a call to agree to it being recorded or transcribed. Only continue if they said yes. No audio is saved; the text stays on this page unless you save it as notes.</p>
          <label className="check"><input type="checkbox" onChange={(e) => setConsent(e.target.checked)} style={{ minHeight: 0 }} /> They agreed to the note-taker</label>
        </div>
      ) : (
        <>
          <div className="actions">
            {supported ? (
              listening
                ? <button type="button" className="secondary" onClick={stop}>Stop listening</button>
                : <button type="button" onClick={start}>Start listening</button>
            ) : (
              <span className="muted">This browser can&apos;t listen. Use Chrome on a laptop or Android, or type what they say below.</span>
            )}
            <button type="button" className="secondary" onClick={() => ask()} disabled={busy || !lines.length}>{busy ? 'Thinking' : 'What do I say?'}</button>
            {listening && <span className="live-dot" aria-live="polite">Listening</span>}
          </div>
          {error && <p className="error" role="alert">{error}</p>}

          <div className={`card suggestion${suggestion ? '' : ' empty'}`} aria-live="polite">
            <div className="task-meta">Say next{suggestion ? (suggestion.source === 'ai' ? ' · from the coach' : ' · from the script') : ''}</div>
            <p className="say">{suggestion ? suggestion.say : 'Suggestions appear here as the conversation goes.'}</p>
            {suggestion?.why && <p className="task-meta" style={{ margin: 0 }}>{suggestion.why}</p>}
          </div>

          <form className="typed" onSubmit={(e) => { e.preventDefault(); if (!typed.trim()) return; setLines((p) => [...p, typed.trim()]); const t = typed.trim(); setTyped(''); ask(t); }}>
            <label>Or type what they just said<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="We already have a cleaner" /></label>
            <button type="submit" className="secondary">Add and suggest</button>
          </form>

          <details open={lines.length > 0}>
            <summary>Transcript ({lines.length} lines)</summary>
            <div className="transcript">
              {lines.map((l, i) => <p key={i}>{l}</p>)}
              {interim && <p className="muted">{interim}</p>}
            </div>
          </details>

          <div className="card">
            <h2 style={{ fontSize: 16 }}>After the call: log it</h2>
            <ActionForm className="log-form" action={logAction}>
              <input type="hidden" name="channel" value="call" />
              <div className="outcome-grid" role="radiogroup" aria-label="What happened">
                {Object.entries(OUTCOMES).map(([key, o]) => (
                  <label key={key} className="choice"><input type="radio" name="outcome" value={key} required /><span>{o.label}</span></label>
                ))}
              </div>
              <label>Notes (edit before saving; the full transcript is not stored)
                <textarea name="notes" rows={4} defaultValue={transcriptText.slice(-1500)} key={lines.length} />
              </label>
              <div className="actions"><button type="submit">Save call</button></div>
            </ActionForm>
          </div>
        </>
      )}
    </div>
  );
}
