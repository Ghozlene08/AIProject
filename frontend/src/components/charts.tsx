// Petits graphiques SVG sans dépendance externe

export function Donut({ value, size = 120, stroke = 12, color = "#1f9d5c", label }: { value: number; size?: number; stroke?: number; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={label ?? `${v} %`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8eef8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <span className="absolute text-2xl font-extrabold text-ink">{Math.round(v)}%</span>
    </div>
  );
}

// Barres verticales (une par jour) : vert = confirmé, rouge = manqué, gris = à venir
export function DayBars({ data }: { data: { label: string; confirmed: number; missed: number; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex h-40 items-end gap-3" role="img" aria-label="Prises de médicaments des derniers jours">
      {data.map((d, i) => {
        const pending = Math.max(0, d.total - d.confirmed - d.missed);
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-32 w-full max-w-9 flex-col-reverse overflow-hidden rounded-lg bg-brand-50">
              <div className="bg-ok-500" style={{ height: `${(d.confirmed / max) * 100}%` }} title={`${d.confirmed} confirmée(s)`} />
              <div className="bg-danger-500" style={{ height: `${(d.missed / max) * 100}%` }} title={`${d.missed} manquée(s)`} />
              <div className="bg-brand-200" style={{ height: `${(pending / max) * 100}%` }} title={`${pending} à venir`} />
            </div>
            <span className="text-xs font-semibold capitalize text-muted">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ values, color = "#2f74e6", height = 44, fill = true }: { values: number[]; color?: string; height?: number; fill?: boolean }) {
  const w = 200;
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 4 - ((v - min) / (max - min || 1)) * (height - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      {fill && <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
