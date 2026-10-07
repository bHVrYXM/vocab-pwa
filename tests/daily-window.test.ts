import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module without types
import { targetInWindow, zonedToUtc } from '../scripts/daily-window.mjs';

const utc = (s: string) => Date.parse(`${s}Z`);
const TZ = 'Europe/Berlin';

describe('zonedToUtc', () => {
  it('handles summer and winter time', () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, TZ)).toBe(utc('2026-07-01T07:00:00')); // CEST, UTC+2
    expect(zonedToUtc(2026, 12, 1, 9, 0, TZ)).toBe(utc('2026-12-01T08:00:00')); // CET, UTC+1
  });
});

describe('targetInWindow', () => {
  it('picks exactly one hourly run per day, in summer and winter', () => {
    for (const day of ['2026-07-01', '2026-12-01', '2026-10-25' /* DST ends */, '2026-03-29' /* DST starts */]) {
      const hits: number[] = [];
      for (let h = 0; h < 24; h++) {
        const run = utc(`${day}T${String(h).padStart(2, '0')}:47:00`); // a typical 2-minute delay
        const t = targetInWindow(run, '09:00', TZ);
        if (t !== null) hits.push(t);
      }
      expect(hits, day).toHaveLength(1);
      expect(new Date(hits[0]).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })).toBe('09:00');
    }
  });

  it('still sends when the run starts after the target time', () => {
    // 09:00 CEST = 07:00 UTC; the 06:45 run started 30 minutes late.
    expect(targetInWindow(utc('2026-07-01T07:15:00'), '09:00', TZ)).toBe(utc('2026-07-01T07:00:00'));
  });

  it('works for times right after midnight (next local day)', () => {
    // 00:30 CEST on July 2 = 22:30 UTC on July 1, owned by the 21:45 UTC run.
    expect(targetInWindow(utc('2026-07-01T21:47:00'), '00:30', TZ)).toBe(utc('2026-07-01T22:30:00'));
    expect(targetInWindow(utc('2026-07-01T22:47:00'), '00:30', TZ)).toBeNull();
  });

  it('rejects malformed times', () => {
    expect(() => targetInWindow(Date.now(), '9am', TZ)).toThrow(/Invalid time/);
  });
});
