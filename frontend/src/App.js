import React, { useState, lazy, Suspense, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MotionConfig } from 'framer-motion';
import './i18n';
import './App.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MarketProvider } from './contexts/MarketContext';
import ErrorBoundary from './components/layout/ErrorBoundary';

import { LockScreen } from './components/layout/LockScreen';

const safeStorageGet = (key, fallback = null) => {
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
};

const createLazyWithRetry = (importer, cacheKey) => {
  return lazy(async () => {
    const isChunkLikeError = (err) => {
      const message = String(err?.message || err || '');
      return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i.test(
        message
      );
    };

    try {
      return await importer();
    } catch (error) {
      if (!isChunkLikeError(error) || typeof window === 'undefined') {
        throw error;
      }

      const retryKey = `karion_lazy_retry_${cacheKey}`;
      const reloadKey = `karion_lazy_reload_${cacheKey}`;
      const alreadyRetried = sessionStorage.getItem(retryKey) === '1';
      let finalError = error;

      if (!alreadyRetried) {
        sessionStorage.setItem(retryKey, '1');
        try {
          return await importer();
        } catch (retryError) {
          finalError = retryError;
        }
      }
      sessionStorage.removeItem(retryKey);

      if (!isChunkLikeError(finalError)) {
        throw finalError;
      }

      const alreadyReloaded = sessionStorage.getItem(reloadKey) === '1';
      if (!alreadyReloaded) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
        return await new Promise(() => {});
      }

      sessionStorage.removeItem(reloadKey);
      throw finalError;

    }
  });
};

// Route-level code splitting: load page code only when route is visited.
const Layout = createLazyWithRetry(() => import('./components/layout/Layout'), 'layout');
const LandingPage = createLazyWithRetry(
  () => import('./components/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
  'landing'
);
const AuthPage = createLazyWithRetry(() => import('./components/pages/AuthPage'), 'auth');
const DashboardPage = createLazyWithRetry(() => import('./components/pages/DashboardPage'), 'dashboard');
const ProfilePage = createLazyWithRetry(() => import('./components/pages/ProfilePage'), 'profile');
const StrategyPage = createLazyWithRetry(() => import('./components/pages/StrategyPage'), 'strategy');
const PsychologyPage = createLazyWithRetry(() => import('./components/pages/PsychologyPage'), 'psychology');
const JournalPage = createLazyWithRetry(() => import('./components/pages/JournalPage'), 'journal');
const AIPage = createLazyWithRetry(() => import('./components/pages/AIPage'), 'ai');
const MonteCarloPage = createLazyWithRetry(() => import('./components/pages/MonteCarloPage'), 'montecarlo');
const StatisticsPage = createLazyWithRetry(() => import('./components/pages/StatisticsPage'), 'statistics');
const AscensionPage = createLazyWithRetry(() => import('./components/pages/AscensionPage'), 'ascension');
const SettingsPage = createLazyWithRetry(() => import('./components/pages/SettingsPage'), 'settings');
const NewsPage = createLazyWithRetry(() => import('./components/pages/NewsPage'), 'news');
const ReportPage = createLazyWithRetry(() => import('./components/pages/ReportPage'), 'report');
const RiskPage = createLazyWithRetry(() => import('./components/pages/RiskPage'), 'risk');
const COTPage = createLazyWithRetry(() => import('./components/pages/COTPage'), 'cot');
const OptionsFlowPage = createLazyWithRetry(() => import('./components/pages/OptionsFlowPage'), 'optionsflow');
const MacroEconomyPage = createLazyWithRetry(() => import('./components/pages/MacroEconomyPage'), 'macro');
const CryptoPage = createLazyWithRetry(() => import('./components/pages/CryptoPage'), 'crypto');
const CalculatorPage = createLazyWithRetry(() => import('./components/pages/CalculatorPage'), 'calculator');
const PricingPage = createLazyWithRetry(() => import('./components/pages/PricingPage'), 'pricing');
const CheckoutSuccessPage = createLazyWithRetry(
  () => import('./components/pages/CheckoutSuccessPage'),
  'checkoutsuccess'
);
const IntroPreviewPage = createLazyWithRetry(() => import('./components/pages/IntroPreviewPage'), 'intropreview');
const MobilePreviewPage = createLazyWithRetry(
  () => import('./components/pages/MobilePreviewPage'),
  'mobilepreview'
);
const BacktestPage = createLazyWithRetry(() => import('./components/pages/BacktestPage'), 'backtest');
const ResearchPage = createLazyWithRetry(() => import('./components/pages/ResearchPage'), 'research');

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, isInitialized } = useAuth();

  // Wait until auth is fully initialized before making routing decisions
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Public Route Component (redirect if authenticated)
const PublicRoute = ({ children, isHome = false }) => {
  const { user, isInitialized } = useAuth();

  // Wait until auth is fully initialized before making routing decisions
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Only redirect away if NOT the home page
  if (user && !isHome) {
    return <Navigate to="/app" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Caricamento pagina...</p>
          </div>
        </div>
      }
    >
      <Routes>
        {/* Public Routes */}
        <Route
          path="/"
          element={
            <Navigate to="/auth" replace />
          }
        />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <AuthPage />
            </PublicRoute>
          }
        />
        <Route
          path="/pricing"
          element={<PricingPage />}
        />
        <Route
          path="/checkout/success"
          element={<CheckoutSuccessPage />}
        />
        <Route
          path="/intro-preview"
          element={<IntroPreviewPage />}
        />
        <Route
          path="/welcome"
          element={<LandingPage />}
        />
        <Route
          path="/dev/mobile-preview"
          element={<MobilePreviewPage />}
        />

        {/* Protected Routes - Main App */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <MarketProvider>
                <Layout />
              </MarketProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="strategy" element={<StrategyPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="macro" element={<MacroEconomyPage />} />
          <Route path="risk" element={<RiskPage />} />
          <Route path="cot" element={<COTPage />} />
          <Route path="options" element={<OptionsFlowPage />} />
          <Route path="statistics" element={<StatisticsPage />} />

          <Route path="montecarlo" element={<MonteCarloPage />} />
          <Route path="calculator" element={<CalculatorPage />} />
          <Route path="crypto" element={<CryptoPage />} />
          <Route path="psychology" element={<PsychologyPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="ai" element={<AIPage />} />
          <Route path="ascension" element={<AscensionPage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="research" element={<ResearchPage />} />
        </Route>

        {/* Catch all - Redirect to Landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const isIntroPreviewPath = typeof window !== 'undefined' && window.location.pathname === '/intro-preview';
  const [isLocked, setIsLocked] = useState(() => {
    if (typeof window === 'undefined') return true;
    return safeStorageGet('karion_access') !== 'granted';
  });
  const isMobileDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1024px)').matches;
  }, []);

  useEffect(() => {
    // Preload the most common first routes while lock overlay is visible.
    import('./components/pages/AuthPage').catch(() => {});
    import('./components/pages/LandingPage').catch(() => {});
  }, []);

  useEffect(() => {
    // Warm critical in-app routes to reduce first-click latency in sidebar navigation.
    import('./components/pages/DashboardPage').catch(() => {});
    import('./components/pages/ResearchPage').catch(() => {});
    import('./components/pages/BacktestPage').catch(() => {});
    import('./components/pages/CryptoPage').catch(() => {});
    import('./components/pages/StrategyPage').catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MotionConfig reducedMotion={isMobileDevice ? 'always' : 'never'}>
            <BrowserRouter>
              <AppRoutes />
              <Toaster
                position="top-right"
                richColors
                theme="dark"
                toastOptions={{
                  style: {
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                  }
                }}
              />
            </BrowserRouter>
          </MotionConfig>
          {isLocked && !isIntroPreviewPath && (
            <LockScreen onUnlock={() => setIsLocked(false)} />
          )}
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
