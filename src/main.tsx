import React from 'react';
import ReactDOM from 'react-dom/client';
import './runtime/MockNavigationContext';
import { CanvasApp } from './canvas/CanvasApp';
import './styles.css';

class StudioRootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            backgroundColor: '#09090B',
            color: '#F8FAFC',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#F87171' }}>
            Zelune Studio Recovery Mode
          </div>
          <pre
            style={{
              maxWidth: 720,
              padding: 16,
              borderRadius: 8,
              backgroundColor: '#18181B',
              border: '1px solid #27272A',
              color: '#FCA5A5',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #4F46E5',
              backgroundColor: '#4F46E5',
              color: '#FFFFFF',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Studio Render
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioRootErrorBoundary>
      <CanvasApp />
    </StudioRootErrorBoundary>
  </React.StrictMode>
);
