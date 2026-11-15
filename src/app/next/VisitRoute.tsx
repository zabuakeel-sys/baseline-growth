'use client';
import { useState } from 'react';

// Opens Google Maps with a driving route from where you are now, through today's visits. Uses the
// browser's location when you allow it; if you don't, it still routes through the stops.
export default function VisitRoute({ addresses }: { addresses: string[] }) {
  const [locating, setLocating] = useState(false);
  const stops = addresses.map((a) => (a || '').trim()).filter(Boolean).slice(0, 10);
  if (!stops.length) return null;

  const open = (origin?: string) => {
    const p = new URLSearchParams({ api: '1', travelmode: 'driving', destination: stops[stops.length - 1] });
    if (origin) p.set('origin', origin);
    if (stops.length > 1) p.set('waypoints', stops.slice(0, -1).join('|'));
    window.open(`https://www.google.com/maps/dir/?${p.toString()}`, '_blank', 'noopener');
  };

  const go = () => {
    if (!navigator.geolocation) { open(); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); open(`${pos.coords.latitude},${pos.coords.longitude}`); },
      () => { setLocating(false); open(); }, // denied or failed: route without a start point
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  };

  return (
    <button type="button" className="call" onClick={go} aria-busy={locating}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" />
      </svg>
      {locating ? 'Finding you…' : `Plan my visit route (${stops.length})`}
    </button>
  );
}
