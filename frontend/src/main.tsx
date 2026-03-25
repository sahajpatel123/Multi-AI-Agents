import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MicroLoader from './components/MicroLoader'
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
import { AccountPage } from './pages/AccountPage'
import { AgentPage } from './pages/AgentPage'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './hooks/useAuth'
import { PanelProvider } from './context/PanelContext'
import { TierProvider } from './context/TierContext'
import { ProfileModalProvider } from './context/ProfileModalContext'
import { ProfileModal } from './components/ProfileModal'
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
          <TierProvider>
            <PanelProvider>
              <BrowserRouter>
                <ProfileModalProvider>
                <ProfileModal />
                <Suspense fallback={
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    background: '#F5F0E8',
                  }}>
                    <MicroLoader />
                  </div>
                }>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/arena" element={
                    <ProtectedRoute>
                      <Navigate to="/app" replace />
                    </ProtectedRoute>
                  } />
                  <Route path="/product" element={<ProductPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/personas" element={<PersonasPage />} />
                  <Route path="/app" element={
                    <ProtectedRoute>
                      <App />
                    </ProtectedRoute>
                  } />
                  <Route path="/account" element={
                    <ProtectedRoute>
                      <AccountPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/agent" element={
                    <ProtectedRoute>
                      <AgentPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/agent/history" element={
                    <ProtectedRoute>
                      <Navigate to="/agent" replace />
                    </ProtectedRoute>
                  } />
                </Routes>
                </Suspense>
                </ProfileModalProvider>
              </BrowserRouter>
            </PanelProvider>
          </TierProvider>
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => {
      loader.remove();
    }, 300);
  }
}
