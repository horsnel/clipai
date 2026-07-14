/**
 * ErrorBoundary — catches React render crashes and shows a fallback UI
 * instead of a blank white screen. Also logs the error to /api/log.
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../lib/logger';
import { Logo } from './Logo';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `React crash: ${error.message}`,
      { componentStack: info.componentStack?.slice(0, 2000) },
      error.stack,
    );
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-clip-dark flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <Logo size="lg" showWord />
          </div>

          <div className="space-y-2">
            <h1 className="font-display font-bold text-2xl text-clip-text">
              Something broke
            </h1>
            <p className="text-clip-muted text-sm leading-relaxed">
              We hit an unexpected error. Our team has been notified.
              Try reloading — your data is safe.
            </p>
          </div>

          {this.state.error && (
            <details className="text-left bg-clip-surface border border-clip-border rounded-xl p-3">
              <summary className="text-xs text-clip-muted cursor-pointer hover:text-clip-text">
                Technical details
              </summary>
              <pre className="mt-2 text-xs text-clip-muted overflow-x-auto whitespace-pre-wrap break-all">
                {this.state.error.message}
                {this.state.error.stack && `\n\n${this.state.error.stack.slice(0, 1000)}`}
              </pre>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="btn-primary px-6 py-3 text-sm font-medium"
            >
              Reload page
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-6 py-3 text-sm font-medium text-clip-muted hover:text-clip-text border border-clip-border rounded-lg transition-colors"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
