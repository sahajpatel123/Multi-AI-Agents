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

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: 'red' }}>
          <h2>App crashed:</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML = '<div style="color:red;padding:2rem;font-family:monospace">ROOT ELEMENT NOT FOUND - Check index.html for &lt;div id="root"&gt;&lt;/div&gt;</div>';
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
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
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
