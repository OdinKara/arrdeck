import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/tokens.css';

// Keyframes used by the Spinner (kept here so tokens.css stays pure tokens).
const style = document.createElement('style');
style.textContent = `
  @keyframes arrdeck-spin { to { transform: rotate(360deg); } }
  @keyframes arrdeck-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;
document.head.appendChild(style);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
