import React from 'react';
import ReactDOM from 'react-dom/client';
import { CanvasApp } from './canvas/CanvasApp';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CanvasApp />
  </React.StrictMode>
);
