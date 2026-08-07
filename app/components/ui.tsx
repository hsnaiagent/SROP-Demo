'use client';

/**
 * Shared presentation primitives. Every screen is built from these, so the platform
 * reads as one product rather than eleven pages.
 *
 * Numbers are always tabular and monospace: a column of figures that shifts as digits
 * change is a column nobody scans.
 */

import type { ReactNode } from 'react';

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
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
          {lede && <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{lede}</p>}
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
    default: 'border-zinc-800 bg-zinc-900/50',
    good: 'border-emerald-900/60 bg-emerald-500/[0.04]',
    warn: 'border-amber-900/60 bg-amber-500/[0.04]',
    bad: 'border-red-900/60 bg-red-500/[0.04]',
    accent: 'border-zinc-700 bg-zinc-900',
  };
  return (
    <section className={`rounded-xl border ${tones[tone]} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/70 px-5 py-3.5">
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
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

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">{children}</p>}
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
    primary: 'bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500',
    good: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500',
    ghost:
      'border border-zinc-700 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800/50 disabled:border-zinc-800 disabled:text-zinc-600',
    quiet: 'text-zinc-400 hover:text-zinc-100 disabled:text-zinc-700',
    danger:
      'border border-red-900 text-red-300 hover:border-red-700 hover:bg-red-500/10 disabled:border-zinc-800 disabled:text-zinc-600',
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
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-amber-500';

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
      className={`rounded-lg border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500 ${className}`}
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
  tabs: Array<{ value: T; label: string; badge?: ReactNode }>;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            value === t.value ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
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
    neutral: 'bg-zinc-800 text-zinc-300',
    good: 'bg-emerald-500/15 text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-300',
    bad: 'bg-red-500/15 text-red-300',
    info: 'bg-sky-500/15 text-sky-300',
    accent: 'bg-amber-500 text-zinc-950',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]} ${
        mono ? 'font-mono tabular-nums' : ''
      }`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400 ${className}`}
    />
  );
}

export function Dot({ tone }: { tone: 'good' | 'warn' | 'bad' | 'idle' }) {
  const tones = {
    good: 'bg-emerald-400',
    warn: 'bg-amber-400',
    bad: 'bg-red-400',
    idle: 'bg-zinc-600',
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
    info: 'border-sky-900/70 bg-sky-500/[0.06] text-sky-100',
    good: 'border-emerald-900/70 bg-emerald-500/[0.06] text-emerald-100',
    warn: 'border-amber-900/70 bg-amber-500/[0.06] text-amber-100',
    bad: 'border-red-900/70 bg-red-500/[0.06] text-red-100',
  };
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tones[tone]}`}>
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
    neutral: 'text-zinc-50',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  };
  const interactive = onClick ? 'cursor-pointer hover:border-zinc-600' : '';
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-colors ${interactive}`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`font-mono text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
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
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80">
            {columns.map((c, i) => (
              <th
                key={c + i}
                className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 ${
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
    critical: 'border-l-2 border-l-red-500 bg-red-500/[0.04]',
    warning: 'border-l-2 border-l-amber-500 bg-amber-500/[0.03]',
    ok: 'border-l-2 border-l-transparent',
    changed: 'border-l-2 border-l-sky-500 bg-sky-500/[0.04]',
  };
  return (
    <tr
      onClick={onClick}
      className={`border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 ${
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
    muted: 'text-zinc-500',
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-red-300',
  };
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap px-3 py-2 ${right ? 'text-right' : ''} ${
        mono ? 'font-mono tabular-nums' : ''
      } ${tone ? tones[tone] : 'text-zinc-200'} ${className}`}
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
      <div className="relative h-2 w-24 shrink-0 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="absolute inset-y-0 rounded-full bg-zinc-700"
          style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
        />
        <div
          className={`absolute inset-y-0 w-[3px] rounded-full ${outside ? 'bg-red-400' : 'bg-emerald-400'}`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-500">
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
