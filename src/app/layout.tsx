import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { currentUser } from '@/lib/auth';
import Nav from './Nav';
import './globals.css';

export const metadata: Metadata = { title: APP_NAME };

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'B';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const owner = user?.role === 'owner';
  const home = owner ? '/' : '/next';
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {user ? (
          <div className="app">
            <aside className="side">
              <Link className="logo" href={home}><span className="mk">B</span> {APP_NAME}</Link>
              <nav><Nav owner={owner} /></nav>
              <div className="sp" />
              <div className="me">
                <span className="av">{initials(user.name)}</span>
                <div><div className="nm">{user.name}</div><div className="ro">{owner ? 'Owner' : 'Salesperson'}</div></div>
                <form action="/logout" method="post"><button className="out" type="submit">Log out</button></form>
              </div>
            </aside>
            <main>
              <div className="mtop">
                <Link className="logo" href={home}>{APP_NAME}</Link>
                <Nav owner={owner} />
                <form action="/logout" method="post"><button className="out" type="submit">Log out</button></form>
              </div>
              <div className="page">{children}</div>
            </main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
