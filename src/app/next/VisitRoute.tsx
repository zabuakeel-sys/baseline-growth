'use client';
import { useState } from 'react';
import { planVisitRoute } from '../sales/actions';

// Opens Google Maps with a driving route through today's visits, ordered shortest-first from where
// you are now. The server geocodes any stop it doesn't have coordinates for. If you decline your
// location, it still routes through the stops.
export default function VisitRoute({ leadIds }: { leadIds: number[] }) {
  const [busy, setBusy] = useState(false);
  if (!leadIds.length) return null;

  const go = () => {
    // Open the tab inside the click so the browser doesn't block it while we wait for the route.
    const tab = window.open('about:blank', '_blank');
    setBusy(true);
    const finish = async (lat: number | null, lng: number | null) => {
      try {
        const url = await planVisitRoute(leadIds, lat, lng);
        if (url && tab) tab.location.href = url;
        else if (url) window.location.href = url;
        else tab?.close();
      } finally {
        setBusy(false);
      }
    };
    if (!navigator.geolocation) { finish(null, null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(pos.coords.latitude, pos.coords.longitude),
      () => finish(null, null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  };

  return (
    <button type="button" className="call" onClick={go} aria-busy={busy} disabled={busy}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" />
      </svg>
      {busy ? 'Planning route…' : `Plan my visit route (${leadIds.length})`}
    </button>
  );
}
