import { redirect } from 'next/navigation';
import { APP_NAME } from '@/lib/config';
import { currentUser } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return (
    <div className="login card">
      <h1>{APP_NAME}</h1>
      <p className="sub">Sign in to continue.</p>
      <LoginForm />
    </div>
  );
}
