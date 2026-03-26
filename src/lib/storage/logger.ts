// Simple logger for storage operations
// Console-based logging with environment awareness

/**
 * Logger interface for storage operations
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string | Error, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
}

/**
 * Create a logger instance for a specific module
 * Debug logs only appear in development mode
 *
 * @param name - Module name for log prefix
 * @returns Logger instance
 */
export function createLogger(name: string): Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const prefix = `[${name}]`;

  return {
    debug: (message: string, ...args: unknown[]): void => {
      if (isDevelopment) {
        console.debug(prefix, message, ...args);
      }
    },

    info: (message: string, ...args: unknown[]): void => {
      console.info(prefix, message, ...args);
    },

    warn: (message: string | Error, ...args: unknown[]): void => {
      console.warn(prefix, message, ...args);
    },

    error: (message: string | Error, ...args: unknown[]): void => {
      console.error(prefix, message, ...args);
    },
  };
}
