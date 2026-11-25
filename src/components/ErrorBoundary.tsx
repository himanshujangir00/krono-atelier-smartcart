import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed.error && parsed.operationType) {
        message = `Database ${parsed.operationType} on "${parsed.path ?? 'collection'}" failed: ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E4E4E0] rounded-lg p-6 space-y-4">
            <h1 className="font-display text-lg font-bold text-[#18181B]">
              Unable to complete request
            </h1>
            <p className="text-xs text-[#52525B] leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-xs font-medium bg-[#18181B] text-white rounded-md hover:bg-[#27272A] cursor-pointer"
            >
              Dismiss & Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
