import { useMemo, useState } from 'react';

export type RangePreset = '24h' | '7d' | '30d' | '90d';

const DAY = 86_400_000;

export const PRESETS: Array<{ key: RangePreset; label: string; ms: number; granularity: string }> = [
  { key: '24h', label: '24h', ms: DAY, granularity: 'hour' },
  { key: '7d', label: '7d', ms: 7 * DAY, granularity: 'day' },
  { key: '30d', label: '30d', ms: 30 * DAY, granularity: 'day' },
  { key: '90d', label: '90d', ms: 90 * DAY, granularity: 'week' },
];

export function useDateRange(initial: RangePreset = '30d') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const { from, to, granularity } = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[2];
    const to = Date.now();
    return { from: to - p.ms, to, granularity: p.granularity };
  }, [preset]);
  return { preset, setPreset, from, to, granularity };
}
