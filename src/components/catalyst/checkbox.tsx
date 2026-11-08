import * as Headless from "@headlessui/react";
import clsx from "clsx";

export function CheckboxField({
  className,
  ...props
}: { className?: string } & Omit<Headless.FieldProps, "as" | "className">) {
  return (
    <Headless.Field
      data-slot="field"
      {...props}
      className={clsx(
        className,
        // Base layout
        "grid grid-cols-[1.125rem_1fr] gap-x-4 gap-y-1 sm:grid-cols-[1rem_1fr]",
        // Control layout
        "*:data-[slot=control]:col-start-1 *:data-[slot=control]:row-start-1 *:data-[slot=control]:mt-0.75 sm:*:data-[slot=control]:mt-1",
        // Label layout
        "*:data-[slot=label]:col-start-2 *:data-[slot=label]:row-start-1",
        // Description layout
        "*:data-[slot=description]:col-start-2 *:data-[slot=description]:row-start-2",
        // With description
        "has-data-[slot=description]:**:data-[slot=label]:font-medium",
      )}
    />
  );
}

const base = [
  // Basic layout
  "relative isolate flex size-4.5 items-center justify-center rounded-[0.3125rem] sm:size-4",
  // Unchecked: input surface with a strong hairline
  "border border-border-strong bg-input group-data-hover:border-text-tertiary",
  // Checked: filled with the role colour, no border
  "group-data-checked:border-transparent group-data-checked:bg-(--checkbox-checked-bg) group-data-indeterminate:border-transparent group-data-indeterminate:bg-(--checkbox-checked-bg)",
  // Focus ring
  "group-data-focus:outline-2 group-data-focus:outline-offset-2 group-data-focus:outline-accent",
  // Disabled state
  "group-data-disabled:opacity-50",
  // Forced colors mode
  "forced-colors:[--checkbox-check:HighlightText] forced-colors:[--checkbox-checked-bg:Highlight] forced-colors:group-data-disabled:[--checkbox-check:Highlight]",
];

// Selected controls use the accent; the check is drawn in the surface colour
// so it reads in both themes.
const colors = {
  accent:
    "[--checkbox-check:var(--color-surface)] [--checkbox-checked-bg:var(--color-accent)]",
  action:
    "[--checkbox-check:var(--color-on-action)] [--checkbox-checked-bg:var(--color-action)]",
  danger:
    "[--checkbox-check:var(--color-text-on-primary)] [--checkbox-checked-bg:var(--color-error-600)]",
};

type Color = keyof typeof colors;

export function Checkbox({
  color = "accent",
  className,
  ...props
}: {
  color?: Color;
  className?: string;
} & Omit<Headless.CheckboxProps, "as" | "className">) {
  return (
    <Headless.Checkbox
      data-slot="control"
      {...props}
      className={clsx(className, "group inline-flex focus:outline-hidden")}
    >
      <span className={clsx([base, colors[color]])}>
        <svg
          className="size-4 stroke-(--checkbox-check) opacity-0 group-data-checked:opacity-100 sm:h-3.5 sm:w-3.5"
          viewBox="0 0 14 14"
          fill="none"
        >
          {/* Checkmark icon */}
          <path
            className="opacity-100 group-data-indeterminate:opacity-0"
            d="M3 8L6 11L11 3.5"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Indeterminate icon */}
          <path
            className="opacity-0 group-data-indeterminate:opacity-100"
            d="M3 7H11"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Headless.Checkbox>
  );
}
