'use client';

/**
 * A tiny external store over localStorage, read through `useSyncExternalStore`.
 *
 * The role switcher and the shared filters both live in localStorage, which makes them
 * external state rather than React state. Reading them in an effect and calling
 * setState causes a cascading render on every mount; this is the sanctioned way to
 * subscribe to something outside React instead.
 *
 * The server snapshot is always the default, so the first paint is deterministic and
 * React re-renders once with the stored value on the client.
 */

import { useSyncExternalStore } from 'react';

export interface LocalStore<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (onChange: () => void) => () => void;
  serverSnapshot: T;
}

export function createLocalStore<T>(key: string, fallback: T): LocalStore<T> {
  const listeners = new Set<() => void>();
  let cache: T = fallback;
  let loaded = false;

  const read = (): T => {
    if (typeof window === 'undefined') return fallback;
    if (!loaded) {
      loaded = true;
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        try {
          cache = JSON.parse(raw) as T;
        } catch {
          // A corrupt value is not worth crashing a screen over.
          cache = fallback;
        }
      }
    }
    return cache;
  };

  return {
    get: read,
    set(next: T) {
      cache = next;
      loaded = true;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
      for (const listener of listeners) listener();
    },
    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    serverSnapshot: fallback,
  };
}

export function useLocalStore<T>(store: LocalStore<T>): [T, (next: T) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, () => store.serverSnapshot);
  return [value, store.set];
}
