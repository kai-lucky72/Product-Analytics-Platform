import { PRESETS, type RangePreset } from '../lib/useDateRange';

export function RangeSelector({
  preset,
  onChange,
}: {
  preset: RangePreset;
  onChange: (p: RangePreset) => void;
}) {
  return (
    <div className="range-selector">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          className={`btn btn-ghost btn-sm ${preset === p.key ? 'active' : ''}`}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
