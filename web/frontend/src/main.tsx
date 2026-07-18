import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MicroLoader from './components/MicroLoader'
import App from './App'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './hooks/useAuth'
import { PanelProvider } from './context/PanelContext'
import { TierProvider } from './context/TierContext'
import { ProfileModalProvider } from './context/ProfileModalContext'
import { ProfileModal } from './components/ProfileModal'
import { NetworkStatusBanner } from './components/NetworkStatusBanner'
import { BackToTopButton } from './components/BackToTopButton'
import { DocumentTitle } from './components/DocumentTitle'
import { ScrollToTop } from './components/ScrollToTop'
import './index.css'

// Lazy-load each page so they're split into separate chunks. The Suspense
// fallback below renders MicroLoader while a chunk loads, giving a
// graceful interactive-paint delay on slow networks. Pages that are
// above-the-fold for the most common entry path (HomePage, PricingPage)
// stay eagerly imported to avoid a flash of fallback on first paint.
const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const ProductPage = lazy(() =>
  import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })),
)
const CapabilitiesPage = lazy(() =>
  import('./pages/CapabilitiesPage').then((m) => ({ default: m.CapabilitiesPage })),
)
const PricingPage = lazy(() =>
  import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })),
)
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
)
const SignInPage = lazy(() =>
  import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })),
)
const ChangelogPage = lazy(() =>
  import('./pages/ChangelogPage').then((m) => ({ default: m.ChangelogPage })),
)
const TermsPage = lazy(() =>
  import('./pages/TermsPage').then((m) => ({ default: m.TermsPage })),
)
const PrivacyPage = lazy(() =>
  import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
)
const PersonasPage = lazy(() =>
  import('./pages/PersonasPage').then((m) => ({ default: m.PersonasPage })),
)
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const AgentPage = lazy(() =>
  import('./pages/AgentPage').then((m) => ({ default: m.AgentPage })),
)
const RoomPage = lazy(() =>
  import('./pages/RoomPage').then((m) => ({ default: m.RoomPage })),
)
const WatchlistPage = lazy(() =>
  import('./pages/WatchlistPage').then((m) => ({ default: m.WatchlistPage })),
)
const SharePage = lazy(() =>
  import('./pages/SharePage').then((m) => ({ default: m.SharePage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

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
      const msg =
        this.state.error instanceof Error
          ? this.state.error.message
          : 'Something unexpected happened.';
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: '#F5F0E8',
            fontFamily: 'Georgia, Times New Roman, serif',
            color: '#2c1810',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              background: '#FAF7F4',
              border: '0.5px solid #E0D8D0',
              borderRadius: 16,
              padding: '28px 24px',
              boxShadow: '0 12px 32px rgba(44,24,16,0.08)',
            }}
          >
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 12,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#C4956A',
              }}
            >
              Arena
            </p>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 500 }}>
              This screen hit a snag
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.65, color: '#6B6460' }}>
              Your session is fine. Reload to continue — if it keeps happening, try signing out
              and back in.
            </p>
            <p
              style={{
                margin: '0 0 20px',
                fontSize: 12,
                color: '#A89070',
                wordBreak: 'break-word',
              }}
            >
              {msg}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="arena-btn arena-btn--primary arena-btn--md arena-btn--full"
                onClick={() => window.location.reload()}
              >
                Reload Arena
              </button>
              <button
                type="button"
                className="arena-btn arena-btn--ghost arena-btn--md arena-btn--full"
                onClick={() => {
                  window.location.href = '/';
                }}
              >
                Back to home
              </button>
            </div>
          </div>
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
        <BrowserRouter>
          <AuthProvider>
            <TierProvider>
              <PanelProvider>
                <ProfileModalProvider>
                <DocumentTitle />
                <ScrollToTop />
                <ProfileModal />
                <NetworkStatusBanner />
                <BackToTopButton />
                <a href="#main-content" className="skip-to-content">
                  Skip to content
                </a>
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
                <div id="main-content" className="page-enter" tabIndex={-1} style={{ outline: 'none' }}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/arena" element={
                    <ProtectedRoute>
                      <Navigate to="/app" replace />
                    </ProtectedRoute>
                  } />
                  <Route path="/product" element={<ProductPage />} />
                  <Route path="/capabilities" element={<CapabilitiesPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/changelog" element={<ChangelogPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/personas" element={<PersonasPage />} />
                  <Route path="/share" element={<SharePage />} />
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
                  <Route path="/agent/watchlist" element={
                    <ProtectedRoute>
                      <WatchlistPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/agent/history" element={
                    <ProtectedRoute>
                      <Navigate to="/agent" replace />
                    </ProtectedRoute>
                  } />
                  <Route path="/room/:slug" element={<RoomPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
                </div>
                </Suspense>
                </ProfileModalProvider>
              </PanelProvider>
            </TierProvider>
          </AuthProvider>
        </BrowserRouter>
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
