'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div 
            className="max-w-md w-full p-6 rounded-xl"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(239, 68, 68, 0.1)' }}
              >
                <svg 
                  className="w-6 h-6" 
                  style={{ color: '#EF4444' }}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#E6EDF3]">
                  Something went wrong
                </h2>
                <p className="text-sm text-[#64748B]">
                  The application encountered an error
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 rounded-lg bg-[#0B0F14] border border-[#1C2433]">
                <p className="text-xs font-mono text-[#EF4444] mb-1">
                  {this.state.error.name}
                </p>
                <p className="text-xs font-mono text-[#94A3B8]">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="btn-secondary flex-1 py-2.5"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary flex-1 py-2.5"
              >
                Reload Page
              </button>
            </div>

            <p className="text-xs text-[#64748B] mt-4 text-center">
              If this persists, try refreshing your browser
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
