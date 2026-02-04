import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8">
          <div className="rounded-lg bg-white p-6 shadow">
            <h1 className="text-2xl font-bold text-red-600">Erro na interface</h1>
            <p className="mt-2 text-sm text-gray-700">{this.state.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
