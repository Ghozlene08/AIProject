"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";

/*
 * Graphiques de l'administration (SVG, sans dépendance).
 * Palette catégorielle validée (daltonisme + contraste) : ordre fixe, jamais recyclé.
 * Une couleur suit toujours la même entité (un module garde sa couleur partout).
 * Contraste < 3:1 pour certaines teintes : chaque graphique affiche donc une légende chiffrée.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];

export const MODULE_COLORS: Record<string, string> = {
  assistant: SERIES[0],
  agenda: SERIES[1],
  documents: SERIES[2],
  souvenirs: SERIES[3],
  famille: SERIES[4],
  aidant: SERIES[5],
};
export const MODULE_ORDER = ["assistant", "agenda", "documents", "souvenirs", "famille", "aidant"];

// Rampe séquentielle (une teinte, du clair au foncé) pour les intensités
export const BLUE_RAMP = ["#eef5ff", "#cfe0fb", "#9fc2f4", "#5f98e6", "#2a78d6", "#1a4ca8"];

const GRID = "#e8eef8";
const AXIS_TEXT = "#5b6b86";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

// Graduations « rondes » pour l'axe vertical
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/* ---------- Courbes (un seul axe, info-bulle au survol) ---------- */

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  height = 260,
  format = (v) => v.toLocaleString("fr-FR"),
  target,
  area = true,
}: {
  series: LineSeries[];
  labels: string[];
  height?: number;
  format?: (v: number) => string;
  target?: { value: number; label: string };
  area?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const w = Math.max(width, 200);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = labels.length;

  const max = Math.max(1, (target?.value ?? 0) * 1.15, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;

  const path = (vals: (number | null)[]) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${d && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d.trim();
  };

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 70))));

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS_TEXT}>
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                {l}
              </text>
            ) : null,
          )}
          {target && (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={y(target.value)} y2={y(target.value)} stroke="#e5484d" strokeDasharray="5 4" strokeWidth={1.5} />
              <text x={w - pad.r} y={y(target.value) - 6} textAnchor="end" fontSize={11} fontWeight={700} fill="#c53035">
                {target.label}
              </text>
            </g>
          )}
          {series.map((s) => (
            <g key={s.key}>
              {area && !s.dashed && (
                <path d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity={0.08} />
              )}
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 5" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} stroke="#9fb2d0" strokeWidth={1} />
              {series.map((s) =>
                s.values[hover] != null ? (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] as number)} r={5} fill={s.color} stroke="#fff" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-pop"
          style={{ left: Math.min(x(hover) + 12, w - 180), top: 8 }}
        >
          <p className="mb-1 font-bold text-ink">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <b className="text-ink">{s.values[hover] != null ? format(s.values[hover] as number) : "—"}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- Anneau (part du total, ≤ 6 segments, légende chiffrée) ---------- */

export interface DonutItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ items, centerValue, centerLabel, size = 190 }: { items: DonutItem[]; centerValue: string; centerLabel: string; size?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2; // espace de 2 px entre segments
  const arcs = useMemo(() => {
    const lengths = items.map((it) => (it.value / total) * c);
    // Décalage de chaque segment = somme des longueurs précédentes
    return items.map((it, i) => ({ ...it, dash: Math.max(0, lengths[i] - gap), offset: lengths.slice(0, i).reduce((s, l) => s + l, 0) }));
  }, [items, total, c]);
  const current = items.find((i) => i.key === active);

  return (
    <div className="@container"><div className="flex flex-col items-center gap-6 @lg:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={centerLabel}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5fb" strokeWidth={stroke} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.key ? stroke + 6 : stroke}
              strokeDasharray={`${a.dash} ${c - a.dash}`}
              strokeDashoffset={-a.offset}
              opacity={active && active !== a.key ? 0.35 : 1}
              onMouseEnter={() => setActive(a.key)}
              onMouseLeave={() => setActive(null)}
              className="cursor-pointer transition-all"
            >
              <title>{`${a.label} : ${a.value.toLocaleString("fr-FR")} (${Math.round((a.value / total) * 100)} %)`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-black text-ink">{current ? current.value.toLocaleString("fr-FR") : centerValue}</span>
          <span className="max-w-28 text-xs font-semibold leading-tight text-muted">{current ? current.label : centerLabel}</span>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-1">
        {items.map((i) => (
          <li
            key={i.key}
            onMouseEnter={() => setActive(i.key)}
            onMouseLeave={() => setActive(null)}
            className={cx("grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm", active === i.key && "bg-canvas")}
          >
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
              {i.label}
            </span>
            <span className="w-12 text-right font-bold text-ink">{Math.round((i.value / total) * 100)} %</span>
            <span className="w-14 text-right text-muted">{i.value.toLocaleString("fr-FR")}</span>
          </li>
        ))}
      </ul>
    </div></div>
  );
}

/* ---------- Entonnoir (rampe ordinale) ---------- */

export function Funnel({ steps }: { steps: { label: string; count: number; rate: number | null }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  const ramp = [BLUE_RAMP[5], BLUE_RAMP[4], BLUE_RAMP[3], BLUE_RAMP[2]];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const drop = i > 0 ? steps[i - 1].count - s.count : 0;
        return (
          <li key={s.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_7rem]">
            <span className="font-semibold text-ink">
              {i + 1}. {s.label}
            </span>
            <div className="h-8 rounded-lg bg-canvas" title={`${s.count.toLocaleString("fr-FR")} interactions`}>
              <div className="flex h-full items-center rounded-lg px-2 text-xs font-bold text-white" style={{ width: `${Math.max(4, (s.count / max) * 100)}%`, background: ramp[i] }}>
                {s.rate != null ? `${s.rate.toLocaleString("fr-FR")} %` : ""}
              </div>
            </div>
            <span className="text-right">
              <b className="text-ink">{s.count.toLocaleString("fr-FR")}</b>
              {drop > 0 && <span className="block text-xs text-danger-600">−{drop.toLocaleString("fr-FR")} abandons</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Carte thermique jour × heure (une teinte) ---------- */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function Heatmap({ data, hours = [6, 22] }: { data: number[][]; hours?: [number, number] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const [h0, h1] = hours;
  const cols = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const max = Math.max(1, ...data.flat());
  const color = (v: number) => (v === 0 ? "#f6f8fc" : BLUE_RAMP[Math.min(5, 1 + Math.floor((v / max) * 5))]);

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-xs" aria-label="Activité par jour et par heure">
          <thead>
            <tr>
              <th />
              {cols.map((h) => (
                <th key={h} className="w-7 font-semibold text-muted">
                  {h % 2 === 0 ? `${h}h` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, d) => (
              <tr key={d}>
                <th className="pr-2 text-right font-semibold text-muted">{DAYS[d]}</th>
                {cols.map((h) => (
                  <td
                    key={h}
                    className="h-7 w-7 cursor-default rounded-[5px]"
                    style={{ background: color(row[h]), outline: hover?.d === d && hover.h === h ? "2px solid #12264d" : undefined }}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    aria-label={`${DAYS[d]} ${h}h : ${row[h]} actions`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted">
        <span>{hover ? <b className="text-ink">{`${DAYS[hover.d]} ${hover.h}h–${hover.h + 1}h : ${data[hover.d][hover.h].toLocaleString("fr-FR")} actions`}</b> : "Survolez une case pour le détail"}</span>
        <span className="flex items-center gap-1">
          Moins
          {BLUE_RAMP.map((c) => (
            <span key={c} className="h-3 w-4 rounded-sm" style={{ background: c }} />
          ))}
          Plus
        </span>
      </div>
    </div>
  );
}

/* ---------- Barres réussite / échec / abandon ---------- */

export function OutcomeBars({ rows }: { rows: { label: string; success: number; failure: number; abandon: number; note?: string }[] }) {
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const total = r.success + r.failure + r.abandon || 1;
          const rate = Math.round((r.success / total) * 1000) / 10;
          return (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="text-xs text-muted">
                  <b className="text-sm text-ink">{rate.toLocaleString("fr-FR")} %</b> de réussite · {total.toLocaleString("fr-FR")}
                </span>
              </div>
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" title={`Réussies ${r.success} · Échecs ${r.failure} · Abandons ${r.abandon}`}>
                <div className="bg-ok-500" style={{ width: `${(r.success / total) * 100}%` }} />
                <div className="bg-danger-500" style={{ width: `${(r.failure / total) * 100}%` }} />
                <div className="bg-slate-300" style={{ width: `${(r.abandon / total) * 100}%` }} />
              </div>
              {r.note && <p className="mt-1 text-xs text-muted">{r.note}</p>}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ok-500" /> Réussies</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-danger-500" /> Échecs</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Abandons</span>
      </div>
    </div>
  );
}

/* ---------- Mini-courbe des cartes KPI ---------- */

export function Spark({ values, color = SERIES[0], height = 36 }: { values: number[]; color?: string; height?: number }) {
  const w = 120;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-9 w-28" aria-hidden="true">
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
