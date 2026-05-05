import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Polyfills for simple-peer
import { Buffer } from 'buffer'
window.global = window
window.process = { env: {} }
window.Buffer = Buffer

console.log('Mounting React App...');

const rootElement = document.getElementById('root');
const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
