import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${(process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '')}/api`;

// Demo mode - set to true to bypass authentication
const DEMO_MODE = false;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(DEMO_MODE ? { id: 'demo', name: 'Demo Trader', email: 'trader@karion.io' } : null);
  const [token, setToken] = useState(DEMO_MODE ? 'demo-token' : localStorage.getItem('token'));
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [isInitialized, setIsInitialized] = useState(DEMO_MODE);
  const [subscription, setSubscription] = useState(null);

  const fetchSubscription = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/subscription/status`);
      setSubscription(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      setSubscription(null);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
      // Also fetch subscription after user is loaded
      await fetchSubscription();
    } catch (error) {
      console.error('Failed to fetch user:', error);
      logout();
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
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
      setIsInitialized(true);
    }
  }, [token, fetchUser]);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    // Fetch subscription after login
    setTimeout(() => fetchSubscription(), 100);
    return userData;
  };

  const register = async (email, password, name) => {
    const response = await axios.post(`${API}/auth/register`, { email, password, name });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setSubscription(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  const checkoutPlan = async (planSlug, annual, couponCode = null) => {
    try {
      const { data } = await axios.post(`${API}/create-checkout`, {
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
      user, token, loading, isInitialized,
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

