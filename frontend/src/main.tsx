import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { HomePage } from './pages/HomePage'
import { ProductPage } from './pages/ProductPage'
import { PricingPage } from './pages/PricingPage'
import { AboutPage } from './pages/AboutPage'
import { SignInPage } from './pages/SignInPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { TermsPage } from './pages/TermsPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { PersonasPage } from './pages/PersonasPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './hooks/useAuth'
import { PanelProvider } from './context/PanelContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <PanelProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/product" element={<ProductPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/app" element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            } />
            <Route path="/personas" element={
              <ProtectedRoute>
                <PersonasPage />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </PanelProvider>
    </AuthProvider>
  </React.StrictMode>,
)
