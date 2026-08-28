"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary that catches render errors and shows a recovery UI.
 * Wrap critical sections of the app to prevent a single component crash
 * from taking down the entire page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <p className="mt-4 text-sm font-semibold text-ink">
            Something went wrong
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {this.state.error?.message || "An unexpected error occurred while rendering this section."}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
