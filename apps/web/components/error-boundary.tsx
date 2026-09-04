"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from "lucide-react";
import Link from "next/link";

interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  /** Show a "Go to Dashboard" link instead of just retry */
  showNavigation?: boolean;
  /** Custom page route for the "Go Back" link */
  backHref?: string;
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
    console.error(`[ErrorBoundary:${this.props.name ?? "unnamed"}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV === "development";

      return (
        <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-hairline bg-white p-8">
          <div className="text-center max-w-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>

            <h3 className="mt-4 text-base font-semibold text-ink">
              {this.props.fallbackTitle ?? "Something went wrong"}
            </h3>

            <p className="mt-2 text-sm text-muted leading-relaxed">
              {this.props.fallbackDescription ??
                "An unexpected error occurred in this section. The rest of the application is unaffected."}
            </p>

            {/* Error details (dev mode only) */}
            {isDev && this.state.error && (
              <details className="mt-4 rounded-lg border border-hairline bg-canvas p-3 text-left">
                <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
                  Error details
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-red-600 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a5c2e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#144a24]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>

              {this.props.showNavigation && (
                <>
                  {this.props.backHref ? (
                    <Link
                      href={this.props.backHref}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Go back
                    </Link>
                  ) : (
                    <Link
                      href="/app"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                    >
                      <Home className="h-3.5 w-3.5" />
                      Dashboard
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
