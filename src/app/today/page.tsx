import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// The day's work now lives on /next, grouped per business so no two businesses are blended
// together. /today is kept only as a redirect, so old links and bookmarks land on the one Today.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { who } = await searchParams;
  redirect(who === 'all' ? '/next?who=all' : '/next');
}
