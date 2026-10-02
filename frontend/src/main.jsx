import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getUkSpellchecker } from './lib/ukAutocorrect'

// Warm the UK English dictionary in the background
getUkSpellchecker().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
