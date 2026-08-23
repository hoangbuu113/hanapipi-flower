import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import './typography.css'
import { CommerceProvider } from './context/CommerceContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AccountProvider><CommerceProvider><App /></CommerceProvider></AccountProvider>
    </BrowserRouter>
  </StrictMode>,
)
