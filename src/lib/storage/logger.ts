export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string | Error, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
}

// storage helpers can be imported by either runtime; never forward caller content
export function createLogger(_name: string): Logger {
  return {
    debug: () => { if (process.env.NODE_ENV === "development") console.debug("storage_debug"); },
    info: () => console.info("storage_completed"),
    warn: () => console.warn("storage_warning"),
    error: () => console.error("storage_failed"),
  };
}
