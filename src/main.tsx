import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { bootCompanionDemo } from './demo/companions.ts'
import { bootKonamiVisitor } from './demo/konami-visitor.ts'
import './styles.css'

bootCompanionDemo()
bootKonamiVisitor()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
