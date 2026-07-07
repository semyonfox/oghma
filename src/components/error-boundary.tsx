"use client";

import { Component, ReactNode } from "react";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorBoundaryFallback
          onRetry={() => this.setState({ hasError: false, error: undefined })}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorBoundaryFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center p-8 text-text-secondary">
      <h2 className="text-lg font-semibold mb-2">
        {t("Something went wrong")}
      </h2>
      <p className="text-sm text-text-tertiary mb-4">
        {t("Something unexpected happened. Please try again.")}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm bg-primary-600 text-text-on-primary rounded-radius-md hover:bg-primary-700 transition-colors"
      >
        {t("Try again")}
      </button>
    </div>
  );
}
