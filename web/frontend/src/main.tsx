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
import { MotionButton } from './components/MotionButton'
import './index.css'
import './styles/verdict-prism.css'

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
const DocsPage = lazy(() =>
  import('./pages/DocsPage').then((m) => ({ default: m.DocsPage })),
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
        <div className="app-crash-shell" role="alert">
          <div className="app-crash-shell__card">
            <p className="app-crash-shell__kicker">Arena</p>
            <h2 className="app-crash-shell__title">This screen hit a snag</h2>
            <p className="app-crash-shell__body">
              Your session is fine. Reload to continue — if it keeps happening, try signing out
              and back in.
            </p>
            <p className="app-crash-shell__detail">{msg}</p>
            <div className="app-crash-shell__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={() => window.location.reload()}
              >
                Reload Arena
              </MotionButton>
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

function RouteChunkFallback() {
  return (
    <div
      className="route-chunk-fallback"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="route-chunk-fallback__card">
        <div className="route-chunk-fallback__brand" aria-hidden>
          <span className="route-chunk-fallback__dot" />
          <span className="route-chunk-fallback__name">Arena</span>
        </div>
        <MicroLoader label="Loading page" cycleWords={false} />
        <p className="route-chunk-fallback__copy">Loading this page…</p>
      </div>
    </div>
  );
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
                <Suspense fallback={<RouteChunkFallback />}>
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
                  <Route path="/docs" element={<DocsPage />} />
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
