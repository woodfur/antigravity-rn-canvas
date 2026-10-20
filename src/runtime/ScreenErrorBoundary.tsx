import React from 'react';

interface ScreenErrorBoundaryProps {
  screenName: string;
  children: React.ReactNode;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ScreenErrorBoundary extends React.Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  constructor(props: ScreenErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): ScreenErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: '100%',
            width: '100%',
            backgroundColor: '#18181B',
            color: '#FCA5A5',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 12,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>
            Runtime Error in {this.props.screenName}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              backgroundColor: '#09090B',
              padding: 12,
              borderRadius: 8,
              border: '1px solid #7F1D1D',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.errorMessage}
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
