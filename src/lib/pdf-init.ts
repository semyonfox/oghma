/**
 * PDF.js initialization and configuration
 * Suppresses non-fatal worker warnings for large PDFs
 */

if (typeof window !== 'undefined') {
  // Store original console methods
  const originalWarn = console.warn;
  const originalError = console.error;

  // Create filter for known non-fatal PDF.js warnings
  const shouldSuppressMessage = (message: string): boolean => {
    const msg = String(message).toLowerCase();
    return (
      msg.includes('getoperatorlist') ||
      msg.includes('worker task was terminated') ||
      msg.includes('globalimagecache')
    );
  };

  // Override console.warn to filter PDF.js warnings
  console.warn = function(...args: any[]) {
    const message = args[0];
    if (!shouldSuppressMessage(message)) {
      originalWarn.apply(console, args);
    }
  };

  // Also filter error messages (these come from worker)
  console.error = function(...args: any[]) {
    const message = args[0];
    if (!shouldSuppressMessage(message)) {
      originalError.apply(console, args);
    }
  };
}

export {};
