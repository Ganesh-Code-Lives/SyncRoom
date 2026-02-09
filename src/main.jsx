import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Polyfills for simple-peer
import { Buffer } from 'buffer'
window.global = window
window.process = { env: {} }
window.Buffer = Buffer

console.log('Mounting React App...');

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
