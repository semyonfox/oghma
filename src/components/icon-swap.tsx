import type { ReactNode } from "react";

// cross-fades between two icons, blurring the one on its way out (.icon-swap in globals.css)
export function IconSwap({
  swapped,
  from,
  to,
  className = "",
}: {
  swapped: boolean;
  from: ReactNode;
  to: ReactNode;
  className?: string;
}) {
  return (
    <span className={`icon-swap ${className}`} data-swapped={swapped} aria-hidden="true">
      {from}
      {to}
    </span>
  );
}
