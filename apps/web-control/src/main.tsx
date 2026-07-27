import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/spectral/800.css'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The player still works online when the browser blocks service workers.
    })
  })
}
