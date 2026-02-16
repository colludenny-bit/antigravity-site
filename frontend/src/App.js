import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n';
import './App.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { MarketProvider } from './contexts/MarketContext';

// Layout
import Layout from './components/layout/Layout';
import { LockScreen } from './components/layout/LockScreen';
import { LandingPage } from './components/pages/LandingPage';

// Pages
import AuthPage from './components/pages/AuthPage';
import DashboardPage from './components/pages/DashboardPage';
import ProfilePage from './components/pages/ProfilePage';
import StrategyPage from './components/pages/StrategyPage';
import ChartsPage from './components/pages/ChartsPage';
import PsychologyPage from './components/pages/PsychologyPage';
import JournalPage from './components/pages/JournalPage';
import AIPage from './components/pages/AIPage';
import MonteCarloPage from './components/pages/MonteCarloPage';
import StatisticsPage from './components/pages/StatisticsPage';
import AscensionPage from './components/pages/AscensionPage';
import SettingsPage from './components/pages/SettingsPage';
import NewsPage from './components/pages/NewsPage';
import ReportPage from './components/pages/ReportPage';
import RiskPage from './components/pages/RiskPage';
import COTPage from './components/pages/COTPage';
import OptionsFlowPage from './components/pages/OptionsFlowPage';
import MacroEconomyPage from './components/pages/MacroEconomyPage';
import CryptoPage from './components/pages/CryptoPage';
import CalculatorPage from './components/pages/CalculatorPage';
import PerformancePage from './components/pages/PerformancePage';
import PricingPage from './components/pages/PricingPage';
import CheckoutSuccessPage from './components/pages/CheckoutSuccessPage';
import IntroPreviewPage from './components/pages/IntroPreviewPage';

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
        <Route path="performance" element={<PerformancePage />} />
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
  );
}

function App() {
  const isIntroPreviewPath = typeof window !== 'undefined' && window.location.pathname === '/intro-preview';
  const [isLocked, setIsLocked] = useState(true);

  return (
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
  );
}

export default App;
