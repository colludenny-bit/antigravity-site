import React, { useState, lazy, Suspense, useMemo, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { MotionConfig } from 'framer-motion';
import './i18n';
import './App.css';
import karionLogo from './assets/kairon-logo.png';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MarketProvider } from './contexts/MarketContext';
import ErrorBoundary from './components/layout/ErrorBoundary';

import { LockScreen } from './components/layout/LockScreen';

// Route-level code splitting: load page code only when route is visited.
const Layout = lazy(() => import('./components/layout/Layout'));
const LandingPage = lazy(() => import('./components/pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import('./components/pages/AuthPage'));
const DashboardPage = lazy(() => import('./components/pages/DashboardPage'));
const ProfilePage = lazy(() => import('./components/pages/ProfilePage'));
const StrategyPage = lazy(() => import('./components/pages/StrategyPage'));
const ChartsPage = lazy(() => import('./components/pages/ChartsPage'));
const PsychologyPage = lazy(() => import('./components/pages/PsychologyPage'));
const JournalPage = lazy(() => import('./components/pages/JournalPage'));
const AIPage = lazy(() => import('./components/pages/AIPage'));
const MonteCarloPage = lazy(() => import('./components/pages/MonteCarloPage'));
const StatisticsPage = lazy(() => import('./components/pages/StatisticsPage'));
const AscensionPage = lazy(() => import('./components/pages/AscensionPage'));
const SettingsPage = lazy(() => import('./components/pages/SettingsPage'));
const NewsPage = lazy(() => import('./components/pages/NewsPage'));
const ReportPage = lazy(() => import('./components/pages/ReportPage'));
const RiskPage = lazy(() => import('./components/pages/RiskPage'));
const COTPage = lazy(() => import('./components/pages/COTPage'));
const OptionsFlowPage = lazy(() => import('./components/pages/OptionsFlowPage'));
const MacroEconomyPage = lazy(() => import('./components/pages/MacroEconomyPage'));
const CryptoPage = lazy(() => import('./components/pages/CryptoPage'));
const CalculatorPage = lazy(() => import('./components/pages/CalculatorPage'));
const PricingPage = lazy(() => import('./components/pages/PricingPage'));
const CheckoutSuccessPage = lazy(() => import('./components/pages/CheckoutSuccessPage'));
const IntroPreviewPage = lazy(() => import('./components/pages/IntroPreviewPage'));
const MobilePreviewPage = lazy(() => import('./components/pages/MobilePreviewPage'));

const LoadingBrand = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-6">
    <div className="text-center">
      <div className="karion-loader-wrap mx-auto">
        <img
          src={karionLogo}
          alt="Karion"
          className="karion-loader-logo"
          loading="eager"
          decoding="async"
        />
      </div>
      <div className="karion-loader-dots mt-3" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">Caricamento</span>
    </div>
  </div>
);

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, isInitialized } = useAuth();

  // Wait until auth is fully initialized before making routing decisions
  if (!isInitialized) {
    return <LoadingBrand />;
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
    return <LoadingBrand />;
  }

  // Only redirect away if NOT the home page
  if (user && !isHome) {
    return <Navigate to="/app" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingBrand />}>
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
          <Route path="charts" element={<ChartsPage />} />
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
          <Route path="settings" element={<SettingsPage />} />
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
    return localStorage.getItem('karion_access') !== 'granted';
  });
  const isMobileDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1024px)').matches;
  }, []);

  useEffect(() => {
    // Preload the most common first routes while lock overlay is visible.
    import('./components/pages/AuthPage');
    import('./components/pages/LandingPage');
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
