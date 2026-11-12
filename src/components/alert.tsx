"use client";

import {
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { type ReactNode, useState } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

const alertVariants = {
  warning: {
    bgColor: "bg-warning-500/10",
    outlineColor: "outline-warning-500/25",
    iconColor: "text-warning-700 dark:text-warning-400",
    titleColor: "text-text",
    descColor: "text-text-secondary",
    // static class names: tailwind cannot see classes built at runtime
    dismissColor:
      "hover:bg-warning-500/10 focus-visible:outline-warning-500/50",
    icon: ExclamationTriangleIcon,
  },
  error: {
    bgColor: "bg-error-500/10",
    outlineColor: "outline-error-500/25",
    iconColor: "text-error-700 dark:text-error-400",
    titleColor: "text-text",
    descColor: "text-text-secondary",
    dismissColor:
      "hover:bg-error-500/10 focus-visible:outline-error-500/50",
    icon: XCircleIcon,
  },
  success: {
    bgColor: "bg-success-500/10",
    outlineColor: "outline-success-500/25",
    iconColor: "text-success-700 dark:text-success-400",
    titleColor: "text-text",
    descColor: "text-text-secondary",
    dismissColor:
      "hover:bg-success-500/10 focus-visible:outline-success-500/50",
    icon: CheckCircleIcon,
  },
  info: {
    bgColor: "bg-surface-elevated",
    outlineColor: "outline-border",
    iconColor: "text-accent",
    titleColor: "text-text",
    descColor: "text-text-secondary",
    dismissColor:
      "hover:bg-subtle focus-visible:outline-accent/50",
    icon: InformationCircleIcon,
  },
};

type AlertVariant = keyof typeof alertVariants;
type AlertProps = {
  variant?: AlertVariant;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
  role?: "alert" | "status";
};

export function Alert({
  variant = "info",
  title,
  description,
  children,
  dismissible = false,
  onDismiss,
  className = "",
  role,
}: AlertProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(true);

  const styles = alertVariants[variant];
  const Icon = styles.icon;

  if (!isOpen) return null;

  const handleDismiss = () => {
    setIsOpen(false);
    onDismiss?.();
  };

  return (
    <div
      role={role}
      className={`rounded-radius-lg ${styles.bgColor} p-4 outline ${styles.outlineColor} ${className}`}
    >
      <div className="flex">
        <div className="shrink-0">
          <Icon aria-hidden="true" className={`size-5 ${styles.iconColor}`} />
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${styles.titleColor}`}>
              {title}
            </h3>
          )}
          {description && (
            <div
              className={`${title ? "mt-2" : ""} text-sm ${styles.descColor}`}
            >
              {typeof description === "string" ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </div>
          )}
          {children && (
            <div
              className={`${title ? "mt-2" : ""} text-sm ${styles.descColor}`}
            >
              {children}
            </div>
          )}
        </div>
        {dismissible && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                onClick={handleDismiss}
                className={`inline-flex rounded-radius-md p-1.5 ${styles.iconColor} ${styles.dismissColor} focus-visible:outline-2 focus-visible:outline-offset-2`}
                aria-label={t("Dismiss alert")}
              >
                <span className="sr-only">{t("Dismiss")}</span>
                <XMarkIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
