import { redirect } from 'next/navigation';

// The business list now lives on Home. Keep this path working for older links.
export default function Businesses() {
  redirect('/');
}
