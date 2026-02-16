import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Demo mode - set to true to bypass authentication
const DEMO_MODE = false;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(DEMO_MODE ? { id: 'demo', name: 'Demo Trader', email: 'trader@karion.io' } : null);
  const [token, setToken] = useState(DEMO_MODE ? 'demo-token' : localStorage.getItem('token'));
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [isInitialized, setIsInitialized] = useState(DEMO_MODE);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState(null); // Global auth error state

  const fetchSubscription = useCallback(async () => {
    try {
      const response = await api.get('/subscription/status');
      setSubscription(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      setSubscription(null);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    setError(null);
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setLoading(false);
      setIsInitialized(true);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      // Check if response is valid JSON user object and not HTML (Vercel protection)
      if (response.data && response.data.email) {
        setUser(response.data);
        // Also fetch subscription after user is loaded
        await fetchSubscription();
      } else {
        // Received distinct response (likely HTML from Vercel protection), treat as logout
        console.warn('Invalid user data received, logging out');
        logout();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        logout();
      } else {
        // Network error or timeout, don't logout immediately but stop loading
        setError(error.userMessage || 'Errore di connessione');
      }
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  }, [fetchSubscription]);

  useEffect(() => {
    if (DEMO_MODE) {
      setIsInitialized(true);
      return;
    }
    fetchUser();
  }, [fetchUser]);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      // Fetch subscription after login
      setTimeout(() => fetchSubscription(), 100);
      return userData;
    } catch (err) {
      const msg = err.userMessage || err.response?.data?.detail || 'Login fallito';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, name) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/auth/register', { email, password, name });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setUser(userData);
      return userData;
    } catch (err) {
      const msg = err.userMessage || err.response?.data?.detail || 'Registrazione fallita';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setSubscription(null);
    setError(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  const checkoutPlan = async (planSlug, annual, couponCode = null) => {
    try {
      const { data } = await api.post('/create-checkout', {
        plan_slug: planSlug,
        annual,
        coupon_code: couponCode
      });
      const { checkout_url } = data;
      // If demo mode returns a relative URL, navigate within app
      if (checkout_url.startsWith('/')) {
        window.location.href = checkout_url;
      } else {
        // Real Stripe — redirect to external checkout
        window.location.href = checkout_url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, isInitialized, error,
      subscription, fetchSubscription,
      login, register, logout, refreshUser, checkoutPlan
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
