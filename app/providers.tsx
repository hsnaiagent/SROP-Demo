'use client';

/**
 * The one client-side store. Everything the screens need comes from here.
 *
 * `act()` posts an action and replaces state from the response, so the client never
 * reconciles a partial update against local state — the server's cycle record is
 * always the truth. That is also what makes the role switcher honest: two identities
 * are looking at the same record, not at two copies.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { CycleRecord, ReferenceData, Stakeholder } from '@/lib/types';

import { createLocalStore, useLocalStore } from './lib/local-store';

export const PLANNER = 'Y - SROP Planner';

type Theme = 'light' | 'dark';

const themeStore = createLocalStore<Theme>('srop.theme', 'light');

/** Who you are viewing as. External state, so it is read through the store. */
const roleStore = createLocalStore<string>('srop.role', PLANNER);

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStore(themeStore);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

interface ActResult {
  ok: boolean;
  message?: string;
  error?: string;
  extra?: unknown;
  cycle?: CycleRecord | null;
}

interface CycleContextValue {
  cycle: CycleRecord | null;
  reference: ReferenceData | null;
  role: string;
  setRole: (role: string) => void;
  me: Stakeholder | null;
  isPlanner: boolean;
  loading: boolean;
  busy: string | null;
  error: string | null;
  message: string | null;
  clearMessage: () => void;
  act: (action: string, payload?: Record<string, unknown>) => Promise<ActResult>;
  /** Read-only server call that does not mutate the cycle. */
  ask: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

const CycleContext = createContext<CycleContextValue | null>(null);

export function CycleProvider({ children }: { children: ReactNode }) {
  const [cycle, setCycle] = useState<CycleRecord | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [role, setRole] = useLocalStore(roleStore);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cycle')
      .then((r) => r.json())
      .then((data) => {
        setCycle(data.cycle ?? null);
        setReference(data.reference ?? null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}): Promise<ActResult> => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch('/api/cycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, actor: role, payload }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Action failed');
          return { ok: false, error: data.error };
        }
        if ('cycle' in data) setCycle(data.cycle ?? null);
        if (data.reference) setReference(data.reference);
        if (data.message) setMessage(data.message);
        return { ok: true, message: data.message, extra: data.extra, cycle: data.cycle ?? null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Action failed';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setBusy(null);
      }
    },
    [role]
  );

  const ask = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const res = await fetch('/api/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actor: role, payload }),
      });
      return (await res.json()) as Record<string, unknown>;
    },
    [role]
  );

  const me = useMemo(
    () => reference?.stakeholders.find((s) => s.name === role) ?? null,
    [reference, role]
  );

  const value = useMemo<CycleContextValue>(
    () => ({
      cycle,
      reference,
      role,
      setRole,
      me,
      isPlanner: role === PLANNER,
      loading,
      busy,
      error,
      message,
      clearMessage: () => setMessage(null),
      act,
      ask,
    }),
    [cycle, reference, role, setRole, me, loading, busy, error, message, act, ask]
  );

  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

export function useCycle() {
  const ctx = useContext(CycleContext);
  if (!ctx) throw new Error('useCycle must be used inside CycleProvider');
  return ctx;
}
