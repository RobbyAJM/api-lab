import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen font-mono flex flex-col justify-center items-center select-text">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4">
            <h2 className="text-sm font-semibold text-rose-400">API Lab Frontend Error</h2>
            <pre className="text-xs bg-zinc-950 border border-zinc-800/80 p-3 rounded text-zinc-300 overflow-x-auto whitespace-pre-wrap max-h-96">
              {this.state.error?.stack || this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover active:bg-teal-700 text-white rounded text-xs font-sans font-medium transition cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
