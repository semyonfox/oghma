import { useState, useCallback } from "react";

/**
 * useState backed by localStorage with JSON serialization.
 * Reads from localStorage on mount and writes on every update.
 */
export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key],
  );

  return [state, setValue];
}

/**
 * Remove a key from localStorage.
 */
export function clearLocalStorage(key: string) {
  localStorage.removeItem(key);
}
