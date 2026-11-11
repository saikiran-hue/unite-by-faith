import { PillarCategory } from '@/types/database';
import { PILLARS } from '@/lib/pillars';

export type PillarScores = Record<PillarCategory, number>;

interface RoseWindowProps {
  scores: PillarScores;
  size?: number;
  /** Short text in the centre boss, e.g. a match percentage */
  centerLabel?: string;
  tone?: 'light' | 'dark';
  animate?: boolean;
  className?: string;
  /** Screen-reader prefix, e.g. "Interests by pillar" */
  labelPrefix?: string;
}

const C = 50;
const R = 46;
const MIN = 0.32; // a 0-score pane still shows a sliver of glass

function sector(r: number, startDeg: number, endDeg: number) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  const x0 = C + r * Math.cos(a0);
  const y0 = C + r * Math.sin(a0);
  const x1 = C + r * Math.cos(a1);
  const y1 = C + r * Math.sin(a1);
  return `M ${C} ${C} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function arc(r: number, startDeg: number, endDeg: number) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = (endDeg * Math.PI) / 180;
  return `M ${(C + r * Math.cos(a0)).toFixed(2)} ${(C + r * Math.sin(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(C + r * Math.cos(a1)).toFixed(2)} ${(C + r * Math.sin(a1)).toFixed(2)}`;
}

/**
 * Stained-glass rose window: four leaded panes (faith, skills, hobbies,
 * tastes). Each pane's radius grows with its pillar score.
 */
export function RoseWindow({
  scores,
  size = 96,
  centerLabel,
  tone = 'light',
  animate = false,
  className,
  labelPrefix = 'Match by pillar',
}: RoseWindowProps) {
  const lead = tone === 'dark' ? '#15110e' : '#1f1a17';
  const backing = tone === 'dark' ? 'rgba(255,255,255,0.07)' : '#f6f0e7';
  const label = PILLARS.map(
    (p) => `${p.label} ${Math.round(scores[p.key])}%`
  ).join(', ');

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${labelPrefix}: ${label}`}
      className={className}
    >
      <circle cx={C} cy={C} r={R} fill={backing} />
      {PILLARS.map((p, i) => {
        const start = -90 + i * 90;
        const end = start + 90;
        const s = Math.max(0, Math.min(100, scores[p.key])) / 100;
        const r = R * (MIN + (1 - MIN) * s);
        return (
          <g
            key={p.key}
            className={animate ? 'pane' : undefined}
            style={animate ? { animationDelay: `${i * 90}ms` } : undefined}
          >
            <path d={sector(R, start, end)} fill={p.fill} opacity={0.16} />
            {/* three sub-panes with slightly different glass density */}
            {[0, 1, 2].map((k) => (
              <path
                key={k}
                d={sector(r, start + k * 30, start + (k + 1) * 30)}
                fill={p.fill}
                opacity={[0.86, 1, 0.93][k]}
                stroke={lead}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            ))}
            {/* tracery ring */}
            <path
              d={arc(r * 0.6, start, end)}
              fill="none"
              stroke={lead}
              strokeWidth={1.4}
            />
            {/* highlight, like light through glass */}
            <path
              d={arc(r * 0.8, start + 8, start + 34)}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <path
              d={sector(r, start, end)}
              fill="none"
              stroke={lead}
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      <circle cx={C} cy={C} r={R} fill="none" stroke={lead} strokeWidth={3} />
      {Array.from({ length: 12 }).map((_, k) => {
        const a = ((k * 30 + 15) * Math.PI) / 180;
        return (
          <circle
            key={k}
            cx={C + (R - 3.2) * Math.cos(a)}
            cy={C + (R - 3.2) * Math.sin(a)}
            r={2.1}
            fill={tone === 'dark' ? '#30281f' : '#ffffff'}
            stroke={lead}
            strokeWidth={1.2}
          />
        );
      })}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke={lead} strokeWidth={2.5} />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke={lead} strokeWidth={2.5} />
      <circle cx={C} cy={C} r={centerLabel ? 13 : 6} fill={lead} />
      {centerLabel && (
        <text
          x={C}
          y={C}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize={centerLabel.length > 2 ? 9 : 11}
          fontWeight={700}
          fontFamily="var(--font-display)"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}
