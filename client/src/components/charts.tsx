import { useState } from "react";
import { currency } from "../lib/api";

/*
 * Hand-set SVG charts in the app's editorial voice: thin marks, hairline
 * rules, ink and accent from the theme tokens so every paper reads right.
 * Exact figures always live beside the chart (lists, cards, readouts) —
 * the chart carries the shape, the text carries the numbers.
 */

/** Round a scale ceiling up to a friendly number (1/2/2.5/5 × 10^n). */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}

/** A column with a rounded top, anchored flat on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(2, h, w / 2);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

export interface ColumnItem {
  key: string;
  /** Micro label under the column; empty string leaves the slot unlabeled. */
  label: string;
  value: number;
  /** Full text for the native tooltip. */
  title: string;
  /** Accent instead of ink — the viewed month, the line run over. */
  emphasis?: boolean;
}

/**
 * Thin columns over a hairline baseline, with an optional dashed guide
 * for a threshold (the budget rule). Tapping a column can navigate.
 */
export function Columns({
  items,
  guide,
  guideLabel,
  onPick,
  ariaLabel,
}: {
  items: ColumnItem[];
  guide?: number;
  guideLabel?: string;
  onPick?: (item: ColumnItem) => void;
  ariaLabel: string;
}) {
  const W = 320;
  const plotH = 88;
  const labelBand = 14;
  const topPad = guide !== undefined ? 12 : 6;
  const H = topPad + plotH + labelBand;

  const max = niceMax(Math.max(guide ?? 0, ...items.map((i) => i.value)));
  const y = (v: number) => topPad + plotH - (v / max) * plotH;
  const slot = W / Math.max(1, items.length);
  const barW = Math.min(18, slot * 0.6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {/* baseline */}
      <line x1={0} y1={topPad + plotH} x2={W} y2={topPad + plotH} stroke="var(--paper-edge)" strokeWidth={1} />

      {guide !== undefined && guide > 0 && (
        <>
          <line
            x1={0}
            y1={y(guide)}
            x2={W}
            y2={y(guide)}
            stroke="var(--ink-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
          {guideLabel && (
            <>
              {/* a paper halo keeps the label legible when a column runs under it */}
              <text
                x={W}
                y={y(guide) - 3}
                textAnchor="end"
                fontSize={9}
                stroke="var(--paper)"
                strokeWidth={3}
                fill="none"
              >
                {guideLabel}
              </text>
              <text x={W} y={y(guide) - 3} textAnchor="end" fontSize={9} fill="var(--ink-faint)">
                {guideLabel}
              </text>
            </>
          )}
        </>
      )}

      {items.map((item, i) => {
        const cx = i * slot + slot / 2;
        const h = (item.value / max) * plotH;
        return (
          <g
            key={item.key}
            onClick={onPick ? () => onPick(item) : undefined}
            className={onPick ? "cursor-pointer" : undefined}
          >
            <title>{item.title}</title>
            {/* hit area: the whole slot, not just the thin mark */}
            <rect x={i * slot} y={0} width={slot} height={topPad + plotH} fill="transparent" />
            <path
              d={columnPath(cx - barW / 2, y(item.value), barW, h)}
              fill={item.emphasis ? "var(--accent)" : "var(--ink-mute)"}
              opacity={item.emphasis ? 1 : 0.75}
            />
            {item.label && (
              <text
                x={cx}
                y={topPad + plotH + 11}
                textAnchor="middle"
                fontSize={9}
                fill="var(--ink-faint)"
              >
                {item.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The month's pace: cumulative spend against the even pace of the budget —
 * a dashed diagonal from nothing to the month's allowance. Moving a finger
 * or pointer across it reads any day back into the figures above.
 */
export function PaceChart({
  cumulative,
  daysInMonth,
  allowance,
  month,
  projected,
}: {
  /** Cumulative expense total per day, index 0 = the 1st, through today. */
  cumulative: number[];
  daysInMonth: number;
  allowance: number;
  month: string; // yyyy-MM
  /** Where the month closes at the current pace; draws a dotted tail. */
  projected?: number;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const W = 320;
  const plotH = 96;
  const labelBand = 14;
  const topPad = 6;
  const H = topPad + plotH + labelBand;

  const spentSoFar = cumulative[cumulative.length - 1] ?? 0;
  const max = niceMax(Math.max(allowance, spentSoFar, projected ?? 0));
  const x = (day: number) => ((day - 1) / (daysInMonth - 1 || 1)) * W;
  const y = (v: number) => topPad + plotH - (v / max) * plotH;

  const line = cumulative.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i + 1)} ${y(v)}`).join(" ");
  const area =
    cumulative.length > 0
      ? `${line} L ${x(cumulative.length)} ${y(0)} L ${x(1)} ${y(0)} Z`
      : "";

  const day = hoverDay ?? cumulative.length;
  const dayLabel = new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
  const spentAtDay = cumulative[day - 1] ?? 0;
  const paceAtDay = (allowance * day) / daysInMonth;

  function daysFromPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const d = Math.round((px / W) * (daysInMonth - 1)) + 1;
    setHoverDay(Math.min(Math.max(1, d), cumulative.length));
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <p>
          <span className="text-ink-mute">{dayLabel} · </span>
          {currency.format(spentAtDay)}
        </p>
        {allowance > 0 && (
          <p className="text-xs text-ink-faint">even pace {currency.format(paceAtDay)}</p>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none overflow-visible"
        role="img"
        aria-label={`Cumulative spending for the month: ${currency.format(spentSoFar)} so far${
          allowance > 0 ? ` of a ${currency.format(allowance)} allowance` : ""
        }.`}
        onPointerMove={daysFromPointer}
        onPointerDown={daysFromPointer}
        onPointerLeave={() => setHoverDay(null)}
      >
        <line x1={0} y1={topPad + plotH} x2={W} y2={topPad + plotH} stroke="var(--paper-edge)" strokeWidth={1} />

        {allowance > 0 && (
          <line
            x1={x(1)}
            y1={y(0)}
            x2={x(daysInMonth)}
            y2={y(allowance)}
            stroke="var(--ink-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.7}
          />
        )}

        {area && <path d={area} fill="var(--accent)" opacity={0.08} />}
        {cumulative.length > 1 && (
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />
        )}

        {/* the dotted tail: where the month closes at this pace */}
        {projected !== undefined && cumulative.length > 0 && cumulative.length < daysInMonth && (
          <>
            <line
              x1={x(cumulative.length)}
              y1={y(spentSoFar)}
              x2={x(daysInMonth)}
              y2={y(projected)}
              stroke="var(--accent)"
              strokeWidth={1.25}
              strokeDasharray="1 3"
              strokeLinecap="round"
              opacity={0.8}
            />
            <circle
              cx={x(daysInMonth)}
              cy={y(projected)}
              r={2.5}
              fill="var(--paper)"
              stroke="var(--accent)"
              strokeWidth={1.25}
            />
          </>
        )}

        {hoverDay !== null && (
          <line
            x1={x(hoverDay)}
            y1={topPad}
            x2={x(hoverDay)}
            y2={topPad + plotH}
            stroke="var(--paper-edge)"
            strokeWidth={1}
          />
        )}

        {cumulative.length > 0 && (
          <circle
            cx={x(day)}
            cy={y(spentAtDay)}
            r={3}
            fill="var(--accent)"
            stroke="var(--paper)"
            strokeWidth={2}
          />
        )}

        <text x={0} y={H - 3} fontSize={9} fill="var(--ink-faint)">
          {monthDayLabel(month, 1)}
        </text>
        <text x={W} y={H - 3} textAnchor="end" fontSize={9} fill="var(--ink-faint)">
          {monthDayLabel(month, daysInMonth)}
        </text>
      </svg>
    </div>
  );
}

function monthDayLabel(month: string, day: number): string {
  return new Date(`${month}-${String(day).padStart(2, "0")}T00:00:00`).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
}

export interface DayPair {
  key: string;
  /** Weekday initial under the pair. */
  label: string;
  thisWeek: number;
  lastWeek: number;
  title: string;
}

/** Seven days read against the same days last week: ghost beside ink. */
export function WeekPairs({ pairs, ariaLabel }: { pairs: DayPair[]; ariaLabel: string }) {
  const W = 320;
  const plotH = 72;
  const labelBand = 14;
  const topPad = 6;
  const H = topPad + plotH + labelBand;

  const max = niceMax(Math.max(1, ...pairs.flatMap((p) => [p.thisWeek, p.lastWeek])));
  const y = (v: number) => topPad + plotH - (v / max) * plotH;
  const slot = W / Math.max(1, pairs.length);
  const barW = Math.min(12, slot * 0.28);
  const gap = 2;

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px] bg-accent" /> this week
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px] bg-edge" /> last week
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line x1={0} y1={topPad + plotH} x2={W} y2={topPad + plotH} stroke="var(--paper-edge)" strokeWidth={1} />
        {pairs.map((pair, i) => {
          const cx = i * slot + slot / 2;
          return (
            <g key={pair.key}>
              <title>{pair.title}</title>
              <rect x={i * slot} y={0} width={slot} height={topPad + plotH} fill="transparent" />
              <path
                d={columnPath(cx - barW - gap / 2, y(pair.lastWeek), barW, (pair.lastWeek / max) * plotH)}
                fill="var(--paper-edge)"
              />
              <path
                d={columnPath(cx + gap / 2, y(pair.thisWeek), barW, (pair.thisWeek / max) * plotH)}
                fill="var(--accent)"
              />
              <text
                x={cx}
                y={topPad + plotH + 11}
                textAnchor="middle"
                fontSize={9}
                fill="var(--ink-faint)"
              >
                {pair.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * A budget line as a bullet: the track is the line, the fill is the spend,
 * and a fill past its track has run over. SVG so it prints ink-on-white.
 */
export function BulletBar({ spent, budget }: { spent: number; budget: number }) {
  const scale = Math.max(spent, budget, 1);
  const over = spent > budget;
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="h-1 w-full" aria-hidden="true">
      {budget > 0 && (
        <rect x={0} y={0} width={(budget / scale) * 100} height={4} fill="var(--paper-edge)" />
      )}
      {spent > 0 && (
        <rect
          x={0}
          y={0}
          width={(spent / scale) * 100}
          height={4}
          fill={over ? "var(--accent)" : "var(--ink-mute)"}
          opacity={over ? 1 : 0.75}
        />
      )}
    </svg>
  );
}
