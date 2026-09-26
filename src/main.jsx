import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import './typography.css'
import { CommerceProvider } from './context/CommerceContext.jsx'
import { AccountProvider } from './context/AccountContext.jsx'
import { PublicCommerceProvider } from './context/PublicCommerceProvider.jsx'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable.')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <BrowserRouter>
        <PublicCommerceProvider>
          <AccountProvider>
            <CommerceProvider>
              <App />
            </CommerceProvider>
          </AccountProvider>
        </PublicCommerceProvider>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
)
