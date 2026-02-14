// simple logger for socsboard
// replaces Notea's pino-based logger with console-based implementation

export interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string | Error, ...args: any[]) => void;
  error: (message: string | Error, ...args: any[]) => void;
}

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`;

  return {
    debug: (message: string, ...args: any[]) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(prefix, message, ...args);
      }
    },
    info: (message: string, ...args: any[]) => {
      console.info(prefix, message, ...args);
    },
    warn: (message: string | Error, ...args: any[]) => {
      console.warn(prefix, message, ...args);
    },
    error: (message: string | Error, ...args: any[]) => {
      console.error(prefix, message, ...args);
    },
  };
}
