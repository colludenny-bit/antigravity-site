import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n';
import './App.css';

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
              <Layout />
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
  const [isLocked, setIsLocked] = useState(true);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MarketProvider>
            {isLocked && !isIntroPreviewPath ? (
              <LockScreen onUnlock={() => setIsLocked(false)} />
            ) : (
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
            )}
          </MarketProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
