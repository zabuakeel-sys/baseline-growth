import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { currentUser } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = { title: APP_NAME };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        {user && (
          <header className="top">
            <Link href="/" className="brand">{APP_NAME}</Link>
            <nav>
              <Link href="/">Clients</Link>
              <Link href="/work">This week</Link>
              {user.role === 'owner' && <Link href="/money">Money</Link>}
              {user.role === 'owner' && <Link href="/team">Team</Link>}
            </nav>
            <span className="who">{user.name}</span>
            <form action="/logout" method="post"><button className="secondary" type="submit">Log out</button></form>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
