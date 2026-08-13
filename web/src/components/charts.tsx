import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SeriesPoint {
  ts_ms: number;
  [key: string]: number | string;
}

function fmtDate(ts: number, granularity: string): string {
  const d = new Date(ts);
  if (granularity === 'hour') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  if (granularity === 'week') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Timeseries({
  data,
  dataKey = 'value',
  granularity = 'day',
  color = '#6366f1',
}: {
  data: SeriesPoint[];
  dataKey?: string;
  granularity?: string;
  color?: string;
}) {
  if (data.length === 0) return <div className="empty">No data for the selected range.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262b3d" vertical={false} />
        <XAxis
          dataKey="ts_ms"
          tickFormatter={(v) => fmtDate(Number(v), granularity)}
          stroke="#5b6478"
          fontSize={11}
          tickLine={false}
        />
        <YAxis stroke="#5b6478" fontSize={11} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          labelFormatter={(v) => fmtDate(Number(v), granularity)}
          contentStyle={{ background: '#141827', border: '1px solid #2a3040', borderRadius: 8 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${color.slice(1)})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiSeries({
  data,
  keys,
  granularity = 'day',
  colors,
}: {
  data: SeriesPoint[];
  keys: string[];
  granularity?: string;
  colors?: string[];
}) {
  const palette = colors ?? ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];
  if (data.length === 0) return <div className="empty">No data for the selected range.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262b3d" vertical={false} />
        <XAxis
          dataKey="ts_ms"
          tickFormatter={(v) => fmtDate(Number(v), granularity)}
          stroke="#5b6478"
          fontSize={11}
          tickLine={false}
        />
        <YAxis stroke="#5b6478" fontSize={11} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          labelFormatter={(v) => fmtDate(Number(v), granularity)}
          contentStyle={{ background: '#141827', border: '1px solid #2a3040', borderRadius: 8 }}
        />
        <Legend />
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={palette[i % palette.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FunnelChart({ data }: { data: Array<{ event: string; users: number }> }) {
  if (data.length === 0) return <div className="empty">No funnel data.</div>;
  const max = Math.max(...data.map((d) => d.users), 1);
  return (
    <div className="funnel">
      {data.map((step, i) => {
        const widthPct = Math.max((step.users / max) * 100, 4);
        return (
          <div className="funnel-row" key={i}>
            <div className="funnel-step">
              <div className="funnel-fill" style={{ width: `${widthPct}%` }} />
            </div>
            <div className="funnel-label">
              <span className="funnel-event">{step.event}</span>
              <span className="funnel-count">{step.users.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RetentionMatrix({ cohorts }: { cohorts: Array<{ label: string; values: number[] }> }) {
  if (cohorts.length === 0) return <div className="empty">No retention data.</div>;
  const maxPeriods = Math.max(...cohorts.map((c) => c.values.length), 0);
  return (
    <div className="retention-matrix">
      <div className="retention-header">
        <div className="retention-cohort-label">Cohort</div>
        {Array.from({ length: maxPeriods }, (_, i) => (
          <div key={i} className="retention-cell-header">
            {i === 0 ? 'Base' : `W${i}`}
          </div>
        ))}
      </div>
      {cohorts.map((cohort, ci) => {
        const base = cohort.values[0] ?? 1;
        return (
          <div className="retention-row" key={ci}>
            <div className="retention-cohort-label">{cohort.label}</div>
            {cohort.values.map((v, i) => {
              const pct = base > 0 ? Math.round((v / base) * 100) : 0;
              const intensity = Math.max(12, pct);
              return (
                <div key={i} className="retention-cell">
                  <div
                    className="retention-cell-bg"
                    style={{
                      backgroundColor: `rgba(99, 102, 241, ${(intensity / 100) * 0.9})`,
                    }}
                  />
                  <span className="retention-cell-text">{pct}%</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function BarChartSimple({
  data,
  dataKey = 'value',
  color = '#6366f1',
}: {
  data: SeriesPoint[];
  dataKey?: string;
  color?: string;
}) {
  if (data.length === 0) return <div className="empty">No data.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262b3d" vertical={false} />
        <XAxis dataKey="name" stroke="#5b6478" fontSize={11} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis stroke="#5b6478" fontSize={11} tickLine={false} axisLine={false} width={48} />
        <Tooltip contentStyle={{ background: '#141827', border: '1px solid #2a3040', borderRadius: 8 }} />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
