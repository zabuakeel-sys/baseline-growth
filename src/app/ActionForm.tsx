'use client';
import { useEffect, useRef, useState, useTransition } from 'react';

type Result = { error?: string } | void;

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
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Long forms submit from the bottom; bring the error into view so it is not missed.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [error]);
  return (
    <form
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
        });
      }}
    >
      {error && <p ref={errorRef} className="error full" role="alert">{error}</p>}
      {children}
    </form>
  );
}
