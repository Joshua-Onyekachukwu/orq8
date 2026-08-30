"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for development; in production this would go to an error service
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-hairline bg-white p-8">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <h3 className="mt-3 text-sm font-semibold text-ink">
              {this.props.fallbackTitle ?? "Something went wrong"}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted">
              {this.props.fallbackDescription ?? "An unexpected error occurred. You can try reloading this section."}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
