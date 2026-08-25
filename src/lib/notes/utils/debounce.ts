/**
 * Simple debounce utility to replace lodash
 * 
 * Delays function execution by the specified wait time
 * If called again before the delay expires, the previous call is cancelled
 */
export function debounce<Args extends unknown[]>(
  func: (...args: Args) => unknown,
  wait: number
): (...args: Args) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Args) {
    // Clear previous timeout if it exists
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Debounce with optional flush capability
 */
export function createDebouncedFunction<Args extends unknown[]>(
  func: (...args: Args) => unknown,
  wait: number
) {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Args | null = null;

  const debounced = (...args: Args) => {
    lastArgs = args;
    
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (lastArgs) {
        func(...lastArgs);
      }
      timeoutId = null;
      lastArgs = null;
    }, wait);
  };

  // Allow manual flush
  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      if (lastArgs) {
        func(...lastArgs);
      }
      timeoutId = null;
      lastArgs = null;
    }
  };

  // Allow cancel
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastArgs = null;
    }
  };

  return debounced;
}
