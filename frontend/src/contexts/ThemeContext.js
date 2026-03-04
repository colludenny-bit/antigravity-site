import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);
const safeStorageGet = (key, fallback = null) => {
  try {
    const value = localStorage.getItem(key);
    return value ?? fallback;
  } catch (_error) {
    return fallback;
  }
};

const safeStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    // Storage can be unavailable in private/restricted contexts.
  }
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => 'dark');

  // Dark theme variant: 'full-black' or 'carbon-black'
  const [darkVariant, setDarkVariant] = useState(() => {
    const stored = safeStorageGet('karion_dark_variant');
    return stored || 'full-black';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes first
    root.classList.remove('light', 'dark', 'full-black', 'carbon-black');

    // Add theme class
    root.classList.add(theme);
    safeStorageSet('karion_theme', theme);

    // If dark mode, add the variant class
    if (theme === 'dark') {
      root.classList.add(darkVariant);

      // Remove any existing dynamic Carbon Black styles
      const existingStyle = document.getElementById('carbon-black-dynamic-styles');
      if (existingStyle) {
        existingStyle.remove();
      }

      // Inject dynamic CSS for Carbon Black
      // Inject dynamic CSS for Carbon Black - REMOVED
      if (darkVariant === 'carbon-black') {
        // Theme removed as per user request
      }
    }
  }, [theme, darkVariant]);

  // Save dark variant to localStorage
  useEffect(() => {
    safeStorageSet('karion_dark_variant', darkVariant);
  }, [darkVariant]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggleTheme,
      isDark,
      darkVariant,
      setDarkVariant,
      setDarkMode: () => setTheme('dark'),
      setLightMode: () => setTheme('light')
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
