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
import { RouteEnter } from './components/RouteEnter'
import { MotionButton } from './components/MotionButton'
import './index.css'
import './styles/verdict-prism.css'
import './styles/verdict-public-pages.css'

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
const PersonaMatchPage = lazy(() =>
  import('./pages/PersonaMatchPage').then((m) => ({ default: m.PersonaMatchPage })),
)
const PersonaPlaygroundPage = lazy(() =>
  import('./pages/PersonaPlaygroundPage').then((m) => ({ default: m.PersonaPlaygroundPage })),
)
const PersonaPlaygroundComparePage = lazy(() =>
  import('./pages/PersonaPlaygroundComparePage').then((m) => ({
    default: m.PersonaPlaygroundComparePage,
  })),
)
const PersonaPlaygroundCategoriesPage = lazy(() =>
  import('./pages/PersonaPlaygroundCategoriesPage').then((m) => ({
    default: m.PersonaPlaygroundCategoriesPage,
  })),
)
const PersonaPlaygroundFavoritesPage = lazy(() =>
  import('./pages/PersonaPlaygroundFavoritesPage').then((m) => ({
    default: m.PersonaPlaygroundFavoritesPage,
  })),
)
const PersonaPlaygroundIndexPage = lazy(() =>
  import('./pages/PersonaPlaygroundIndexPage').then((m) => ({
    default: m.PersonaPlaygroundIndexPage,
  })),
)
const PersonaPlaygroundWhatsNewPage = lazy(() =>
  import('./pages/PersonaPlaygroundWhatsNewPage').then((m) => ({
    default: m.PersonaPlaygroundWhatsNewPage,
  })),
)
const PersonaPlaygroundFormatsPage = lazy(() =>
  import('./pages/PersonaPlaygroundFormatsPage').then((m) => ({
    default: m.PersonaPlaygroundFormatsPage,
  })),
)
const PersonaPlaygroundSitemapPage = lazy(() =>
  import('./pages/PersonaPlaygroundSitemapPage').then((m) => ({
    default: m.PersonaPlaygroundSitemapPage,
  })),
)
const PersonaBattlePage = lazy(() =>
  import('./pages/PersonaBattlePage').then((m) => ({ default: m.PersonaBattlePage })),
)
const PersonaWheelPage = lazy(() =>
  import('./pages/PersonaWheelPage').then((m) => ({ default: m.PersonaWheelPage })),
)
const PersonaTriviaPage = lazy(() =>
  import('./pages/PersonaTriviaPage').then((m) => ({ default: m.PersonaTriviaPage })),
)
const PersonaMosaicPage = lazy(() =>
  import('./pages/PersonaMosaicPage').then((m) => ({ default: m.PersonaMosaicPage })),
)
const PersonaLibraryPage = lazy(() =>
  import('./pages/PersonaLibraryPage').then((m) => ({ default: m.PersonaLibraryPage })),
)
const PersonaSpeedPage = lazy(() =>
  import('./pages/PersonaSpeedPage').then((m) => ({ default: m.PersonaSpeedPage })),
)
const PersonaRoastPage = lazy(() =>
  import('./pages/PersonaRoastPage').then((m) => ({ default: m.PersonaRoastPage })),
)
const PersonaChallengePage = lazy(() =>
  import('./pages/PersonaChallengePage').then((m) => ({ default: m.PersonaChallengePage })),
)
const PersonaDuelPage = lazy(() =>
  import('./pages/PersonaDuelPage').then((m) => ({ default: m.PersonaDuelPage })),
)
const PersonaEchoPage = lazy(() =>
  import('./pages/PersonaEchoPage').then((m) => ({ default: m.PersonaEchoPage })),
)
const PersonaCouncilPage = lazy(() =>
  import('./pages/PersonaCouncilPage').then((m) => ({ default: m.PersonaCouncilPage })),
)
const PersonaDilemmaPage = lazy(() =>
  import('./pages/PersonaDilemmaPage').then((m) => ({ default: m.PersonaDilemmaPage })),
)
const PersonaForecastPage = lazy(() =>
  import('./pages/PersonaForecastPage').then((m) => ({ default: m.PersonaForecastPage })),
)
const PersonaMosaicRoastPage = lazy(() =>
  import('./pages/PersonaMosaicRoastPage').then((m) => ({ default: m.PersonaMosaicRoastPage })),
)
const PersonaRoastBattlePage = lazy(() =>
  import('./pages/PersonaRoastBattlePage').then((m) => ({ default: m.PersonaRoastBattlePage })),
)
const PersonaConfessionalPage = lazy(() =>
  import('./pages/PersonaConfessionalPage').then((m) => ({ default: m.PersonaConfessionalPage })),
)
const PersonaMosaicCouncilPage = lazy(() =>
  import('./pages/PersonaMosaicCouncilPage').then((m) => ({ default: m.PersonaMosaicCouncilPage })),
)
const PersonaForecastBattlePage = lazy(() =>
  import('./pages/PersonaForecastBattlePage').then((m) => ({ default: m.PersonaForecastBattlePage })),
)
const PersonaRoastBattleCouncilPage = lazy(() =>
  import('./pages/PersonaRoastBattleCouncilPage').then((m) => ({ default: m.PersonaRoastBattleCouncilPage })),
)
const PersonaDilemmaCouncilPage = lazy(() =>
  import('./pages/PersonaDilemmaCouncilPage').then((m) => ({ default: m.PersonaDilemmaCouncilPage })),
)
const PersonaMosaicBattlePage = lazy(() =>
  import('./pages/PersonaMosaicBattlePage').then((m) => ({ default: m.PersonaMosaicBattlePage })),
)
const PersonaDilemmaForecastPage = lazy(() =>
  import('./pages/PersonaDilemmaForecastPage').then((m) => ({ default: m.PersonaDilemmaForecastPage })),
)
const PersonaMosaicDilemmaCouncilPage = lazy(() =>
  import('./pages/PersonaMosaicDilemmaCouncilPage').then((m) => ({ default: m.PersonaMosaicDilemmaCouncilPage })),
)
const PersonaMosaicForecastPage = lazy(() =>
  import('./pages/PersonaMosaicForecastPage').then((m) => ({ default: m.PersonaMosaicForecastPage })),
)
const PersonaMosaicRoastingBattlePage = lazy(() =>
  import('./pages/PersonaMosaicRoastingBattlePage').then((m) => ({ default: m.PersonaMosaicRoastingBattlePage })),
)
const PersonaMosaicDilemmaForecastPage = lazy(() =>
  import('./pages/PersonaMosaicDilemmaForecastPage').then((m) => ({ default: m.PersonaMosaicDilemmaForecastPage })),
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
const AgentSharePage = lazy(() =>
  import('./pages/AgentSharePage').then((m) => ({ default: m.AgentSharePage })),
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
                <a
                  href="#route-content"
                  className="skip-to-content"
                  onClick={(event) => {
                    const target = document.querySelector<HTMLElement>('main')
                      ?? document.getElementById('route-content');
                    if (!target) return;
                    event.preventDefault();
                    target.focus({ preventScroll: true });
                    target.scrollIntoView({ block: 'start' });
                  }}
                >
                  Skip to content
                </a>
                <Suspense fallback={<RouteChunkFallback />}>
                <div id="route-content" tabIndex={-1} style={{ outline: 'none' }}>
                <RouteEnter>
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
                  <Route path="/persona-playground" element={<PersonaPlaygroundPage />} />
                  <Route path="/persona-playground/compare" element={<PersonaPlaygroundComparePage />} />
                  <Route path="/persona-playground/categories" element={<PersonaPlaygroundCategoriesPage />} />
                  <Route path="/persona-playground/favorites" element={<PersonaPlaygroundFavoritesPage />} />
                  <Route path="/persona-playground/index" element={<PersonaPlaygroundIndexPage />} />
                  <Route path="/persona-playground/whats-new" element={<PersonaPlaygroundWhatsNewPage />} />
                  <Route path="/persona-playground/formats" element={<PersonaPlaygroundFormatsPage />} />
                  <Route path="/persona-playground/sitemap" element={<PersonaPlaygroundSitemapPage />} />
                  <Route path="/persona-match" element={<PersonaMatchPage />} />
                  <Route path="/persona-battle" element={<PersonaBattlePage />} />
                  <Route path="/persona-wheel" element={<PersonaWheelPage />} />
                  <Route path="/persona-trivia" element={<PersonaTriviaPage />} />
                  <Route path="/persona-mosaic" element={<PersonaMosaicPage />} />
                  <Route path="/persona-library" element={<PersonaLibraryPage />} />
                  <Route path="/persona-speed" element={<PersonaSpeedPage />} />
                  <Route path="/persona-roast" element={<PersonaRoastPage />} />
                  <Route path="/persona-challenge" element={<PersonaChallengePage />} />
                  <Route path="/persona-duel" element={<PersonaDuelPage />} />
                  <Route path="/persona-echo" element={<PersonaEchoPage />} />
                  <Route path="/persona-council" element={<PersonaCouncilPage />} />
                  <Route path="/persona-dilemma" element={<PersonaDilemmaPage />} />
                  <Route path="/persona-forecast" element={<PersonaForecastPage />} />
                  <Route path="/persona-mosaic-roast" element={<PersonaMosaicRoastPage />} />
                  <Route path="/persona-roast-battle" element={<PersonaRoastBattlePage />} />
                  <Route path="/persona-confessional" element={<PersonaConfessionalPage />} />
                  <Route path="/persona-mosaic-council" element={<PersonaMosaicCouncilPage />} />
                  <Route path="/persona-forecast-battle" element={<PersonaForecastBattlePage />} />
                  <Route path="/persona-roast-battle-council" element={<PersonaRoastBattleCouncilPage />} />
                  <Route path="/persona-dilemma-council" element={<PersonaDilemmaCouncilPage />} />
                  <Route path="/persona-mosaic-battle" element={<PersonaMosaicBattlePage />} />
                  <Route path="/persona-dilemma-forecast" element={<PersonaDilemmaForecastPage />} />
                  <Route path="/persona-mosaic-dilemma-council" element={<PersonaMosaicDilemmaCouncilPage />} />
                  <Route path="/persona-mosaic-forecast" element={<PersonaMosaicForecastPage />} />
                  <Route path="/persona-mosaic-roasting-battle" element={<PersonaMosaicRoastingBattlePage />} />
                  <Route path="/persona-mosaic-dilemma-forecast" element={<PersonaMosaicDilemmaForecastPage />} />
                  <Route path="/share" element={<SharePage />} />
                  <Route path="/share/agent/:token" element={<AgentSharePage />} />
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
                </RouteEnter>
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
