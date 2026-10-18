import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Pick the theme before the first paint: saved choice, otherwise the system setting.
let saved: string | null = null
try { saved = localStorage.getItem('opsflow_theme') } catch { /* storage unavailable */ }
document.documentElement.dataset.theme =
  saved === 'light' || saved === 'dark'
    ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
