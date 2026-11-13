'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action}>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label>Email<input name="email" type="email" autoComplete="email" defaultValue={state.email} required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit" disabled={pending}>{pending ? 'Signing in' : 'Sign in'}</button>
    </form>
  );
}
