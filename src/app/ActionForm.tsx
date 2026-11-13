'use client';
import { useEffect, useRef, useState, useTransition } from 'react';

type Result = { error?: string; field?: string } | void;

/**
 * A form that calls a server action and, when the action returns an error, shows it while
 * keeping everything the person typed. (A plain form action would reset every field.)
 * On success the action redirects, which navigates as usual.
 */
export default function ActionForm({
  action, className, children,
}: {
  action: (formData: FormData) => Promise<Result>;
  className?: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState('');
  const [field, setField] = useState('');
  const [tries, setTries] = useState(0);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Long forms submit from the bottom: go to the field that needs fixing (or the message), every
  // time, even when the message is the same as last time.
  useEffect(() => {
    if (!error) return;
    formRef.current?.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    const input = field ? formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`) : null;
    if (input) {
      input.classList.add('invalid');
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus({ preventScroll: true });
    } else {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error, field, tries]);
  return (
    <form
      ref={formRef}
      className={className}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        // Include the pressed button's name/value, so one form can have several submit buttons.
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(async () => {
          const result = await action(data);
          setError(result?.error ?? '');
          setField(result?.field ?? '');
          setTries((n) => n + 1);
        });
      }}
    >
      {children}
      {error && <p ref={errorRef} className="error full" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </form>
  );
}
