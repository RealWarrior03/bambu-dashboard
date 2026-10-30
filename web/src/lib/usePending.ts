import { useEffect, useState } from 'react';

/**
 * Optimistic value for a control: shows what the user asked for until the printer
 * reports it (or a timeout passes), then falls back to the reported value.
 */
export function usePending<T>(
  actual: T,
  matches: (a: T, b: T) => boolean = Object.is,
  timeoutMs = 8000,
) {
  const [pending, setPending] = useState<{ value: T } | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [pending, timeoutMs]);

  const active = pending !== null && !matches(actual, pending.value);

  return {
    value: active ? pending.value : actual,
    isPending: active,
    set: (value: T) => setPending({ value }),
    clear: () => setPending(null),
  };
}
