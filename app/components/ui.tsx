'use client';

/**
 * Shared presentation primitives. Every screen is built from these, so the platform
 * reads as one product rather than eleven pages.
 *
 * Numbers are always tabular and monospace: a column of figures that shifts as digits
 * change is a column nobody scans.
 */

import type { ReactNode } from 'react';

const cardBase =
  'rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]';

// -------------------------------------------------------------------- structure

export function Screen({
  title,
  lede,
  actions,
  children,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {lede && <p className="max-w-3xl text-sm leading-relaxed text-text-muted">{lede}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  tone = 'default',
  className = '',
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent';
  className?: string;
  children?: ReactNode;
}) {
  const tones = {
    default: 'border-border bg-surface',
    good: 'border-green-accent/40 bg-green-accent/[0.06]',
    warn: 'border-warn/40 bg-warn/[0.06]',
    bad: 'border-bad/40 bg-bad/[0.06]',
    accent: 'border-blue-accent/40 bg-surface-2 dark:border-green-accent/40',
  };
  return (
    <section className={`${cardBase} ${tones[tone]} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="font-display text-sm font-semibold text-text">{title}</h2>}
            {subtitle && <p className="font-mono text-xs text-text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

export function Grid({ cols = 3, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const map = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' };
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>;
}

export function EmptyState({
  title,
  children,
  placeholder,
}: {
  title: string;
  children?: ReactNode;
  placeholder?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center">
      {placeholder && (
        <div className="mx-auto mb-4 flex justify-center">
          <GridMotif className="w-24" />
        </div>
      )}
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">{children}</p>}
    </div>
  );
}

// --------------------------------------------------------------------- controls

type ButtonTone = 'primary' | 'ghost' | 'quiet' | 'danger' | 'good';

export function Button({
  children,
  onClick,
  disabled,
  tone = 'ghost',
  size = 'md',
  className = '',
  title,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: ButtonTone;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const tones: Record<ButtonTone, string> = {
    primary:
      'bg-blue-accent text-white hover:brightness-110 disabled:bg-surface-2 disabled:text-text-muted',
    good: 'bg-green-accent text-white hover:brightness-110 disabled:bg-surface-2 disabled:text-text-muted',
    ghost:
      'border border-border text-text hover:border-blue-accent/60 hover:bg-surface-2 dark:hover:border-green-accent/60 disabled:border-border disabled:text-text-muted',
    quiet: 'text-text-muted hover:text-text disabled:text-text-muted/50',
    danger:
      'border border-bad/50 text-bad hover:border-bad hover:bg-bad/10 disabled:border-border disabled:text-text-muted',
  };
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-xs text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-muted/60 focus:border-blue-accent dark:focus:border-green-accent';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputBase} resize-y leading-relaxed ${props.className ?? ''}`} />;
}

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-blue-accent dark:focus:border-green-accent ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: string; description?: string; badge?: ReactNode }>;
}) {
  return (
    <div className="flex rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 px-4 py-3 text-center transition-colors ${
              active ? 'bg-surface-2 text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {t.label}
              {t.badge}
            </span>
            {t.description && (
              <span className="font-mono text-[11px] text-text-muted">{t.description}</span>
            )}
            {active && (
              <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-blue-accent dark:bg-green-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  className = '',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-accent bg-blue-accent/15 text-blue-accent dark:border-green-accent dark:bg-green-accent/15 dark:text-green-accent'
          : 'border-border text-text-muted hover:border-blue-accent/40 hover:text-text dark:hover:border-green-accent/40'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({
  label,
  value,
  max = 100,
  tone = 'blue',
  showValue,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: 'blue' | 'green';
  showValue?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill = tone === 'green' ? 'bg-green-accent' : 'bg-blue-accent';
  const display = showValue ?? `${Math.round(pct)}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-text-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums text-text">{display}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function GradientPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: 'linear-gradient(135deg, var(--green) 0%, var(--blue) 50%, var(--bg) 100%)',
      }}
    />
  );
}

export function GridMotif({ className = '' }: { className?: string }) {
  const cells = [
    'gradient',
    'gradient',
    'shimmer',
    'gradient',
    'shimmer',
    'gradient',
    'gradient',
    'gradient',
    'shimmer',
  ];
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {cells.map((type, i) =>
        type === 'gradient' ? (
          <GradientPlaceholder key={i} className="aspect-square rounded-md" />
        ) : (
          <div key={i} className="aspect-square animate-shimmer rounded-md" />
        )
      )}
    </div>
  );
}

// ----------------------------------------------------------------- annunciators

type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent';

export function Badge({
  children,
  tone = 'neutral',
  mono,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  mono?: boolean;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-surface-2 text-text-muted',
    good: 'bg-green-accent/15 text-green-accent',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    info: 'bg-blue-accent/15 text-blue-accent dark:bg-green-accent/15 dark:text-green-accent',
    accent: 'bg-blue-accent text-white',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${tones[tone]} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-3.5 animate-spin rounded-full border-2 border-border border-t-blue-accent dark:border-t-green-accent ${className}`}
    />
  );
}

export function Dot({ tone }: { tone: 'good' | 'warn' | 'bad' | 'idle' }) {
  const tones = {
    good: 'bg-green-accent',
    warn: 'bg-warn',
    bad: 'bg-bad',
    idle: 'bg-text-muted',
  };
  return <span className={`inline-block size-2 shrink-0 rounded-full ${tones[tone]}`} />;
}

export function Banner({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'good' | 'warn' | 'bad';
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const tones = {
    info: 'border-blue-accent/40 bg-blue-accent/[0.06] text-text dark:border-green-accent/40 dark:bg-green-accent/[0.06]',
    good: 'border-green-accent/40 bg-green-accent/[0.06] text-text',
    warn: 'border-warn/40 bg-warn/[0.06] text-text',
    bad: 'border-bad/40 bg-bad/[0.06] text-text',
  };
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-3 ${tones[tone]}`}
    >
      <div className="flex flex-col gap-0.5">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className="text-sm leading-relaxed opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A headline figure. The four across the top of the plan screen are these. */
export function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  hint?: string;
  onClick?: () => void;
}) {
  const tones = {
    neutral: 'text-text',
    good: 'text-green-accent',
    warn: 'text-warn',
    bad: 'text-bad',
  };
  const interactive = onClick ? 'cursor-pointer hover:border-blue-accent/40 dark:hover:border-green-accent/40' : '';
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1 ${cardBase} border-border bg-surface px-4 py-3 transition-colors ${interactive}`}
    >
      <span className="font-mono text-xs text-text-muted">{label}</span>
      <span className={`font-mono text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </div>
  );
}

// -------------------------------------------------------------------- data grid

export function Table({
  columns,
  children,
  align,
}: {
  columns: string[];
  children: ReactNode;
  /** Column indexes to right-align. Numbers should always be right-aligned. */
  align?: number[];
}) {
  const right = new Set(align ?? []);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((c, i) => (
              <th
                key={c + i}
                className={`whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-text-muted ${
                  right.has(i) ? 'text-right' : 'text-left'
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  tone,
  onClick,
}: {
  children: ReactNode;
  tone?: 'critical' | 'warning' | 'ok' | 'changed';
  onClick?: () => void;
}) {
  const tones = {
    critical: 'border-l-2 border-l-bad bg-bad/[0.04]',
    warning: 'border-l-2 border-l-warn bg-warn/[0.03]',
    ok: 'border-l-2 border-l-transparent',
    changed: 'border-l-2 border-l-blue-accent bg-blue-accent/[0.04] dark:border-l-green-accent dark:bg-green-accent/[0.04]',
  };
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border/60 last:border-0 hover:bg-surface-2/50 ${
        tone ? tones[tone] : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  right,
  mono,
  tone,
  className = '',
  colSpan,
}: {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  tone?: 'muted' | 'good' | 'warn' | 'bad';
  className?: string;
  colSpan?: number;
}) {
  const tones = {
    muted: 'text-text-muted',
    good: 'text-green-accent',
    warn: 'text-warn',
    bad: 'text-bad',
  };
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap px-3 py-2 ${right ? 'text-right' : ''} ${
        mono ? 'font-mono tabular-nums' : ''
      } ${tone ? tones[tone] : 'text-text'} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * Closing inventory against its own min-max band. The bar is the comparison version 1
 * omitted — a level means nothing without the band it has to sit inside.
 */
export function BandBar({
  value,
  min,
  max,
}: {
  value: number;
  min: number;
  max: number;
}) {
  const span = Math.max(max * 1.35, value * 1.1, 1);
  const pos = Math.min(100, Math.max(0, (value / span) * 100));
  const bandStart = (min / span) * 100;
  const bandWidth = ((max - min) / span) * 100;
  const outside = value < min || value > max;

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 rounded-full bg-border"
          style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
        />
        <div
          className={`absolute inset-y-0 w-[3px] rounded-full ${outside ? 'bg-bad' : 'bg-green-accent'}`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-text-muted">
        {min}–{max}
      </span>
    </div>
  );
}

// -------------------------------------------------------------------- formatters

export const fmtKb = (n: number) => `${n.toFixed(1)} kb`;

export const fmtMoney = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

export const fmtDelta = (n: number, unit = 'kb') => {
  if (n === 0) return `0.0 ${unit}`;
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)} ${unit}`;
};

export const fmtMoneyDelta = (n: number) => {
  const sign = n < 0 ? '−' : '+';
  return `${sign}${fmtMoney(Math.abs(n))}`;
};

export const fmtPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 100))}%`;

/** `refinery=JAZAN,bulk_plant=BP-JAZAN,product=DIESEL,month=2026-10` -> readable */
export const prettyRef = (rowRef: string) =>
  rowRef
    .split(',')
    .map((pair) => pair.split('=')[1] ?? pair)
    .join(' · ');

export const relTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toISOString().slice(0, 10);
};
