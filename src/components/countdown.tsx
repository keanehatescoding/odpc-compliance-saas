"use client";

import { useEffect, useState } from "react";

function format(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const text = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return ms >= 0 ? `${text} left` : `${text} overdue`;
}

/** Time left until `deadline`, updated every 30 seconds. Rendered on the server first, so it works without JS. */
export function Countdown({ deadline, now }: { deadline: string; now: string }) {
  const end = Date.parse(deadline);
  const [current, setCurrent] = useState(() => Date.parse(now));
  useEffect(() => {
    const t = setInterval(() => setCurrent(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{format(end - current)}</span>;
}
