'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICONS: Record<string, React.ReactNode> = {
  today: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 2v4M16 2v4" /></>,
  overview: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
  biz: <><path d="M4 20V6l8-3 8 3v14" /><path d="M9 20v-6h6v6" /></>,
  team: <><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2-5 5-5s5 2 5 5" /><path d="M16 6a3 3 0 0 1 0 6" /></>,
  money: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  board: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
};

/** The app navigation, with the current page highlighted. Rendered in the dark sidebar and the mobile bar. */
export default function Nav({ owner }: { owner: boolean }) {
  const path = usePathname();
  const items = owner
    ? [
        { href: '/next', label: 'Today', icon: 'today' },
        { href: '/', label: 'Overview', icon: 'overview' },
        { href: '/clients', label: 'Businesses', icon: 'biz' },
        { href: '/team', label: 'Team', icon: 'team' },
        { href: '/money', label: 'Money', icon: 'money' },
      ]
    : [
        { href: '/next', label: 'Today', icon: 'today' },
        { href: '/clients', label: 'My businesses', icon: 'biz' },
        { href: '/scoreboard', label: 'Scoreboard', icon: 'board' },
      ];
  const active = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`) || (href === '/clients' && path.startsWith('/clients'));
  return (
    <>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={active(it.href) ? 'on' : undefined}>
          <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[it.icon]}</svg>
          {it.label}
        </Link>
      ))}
    </>
  );
}
