import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, LineChart, Brain, BookOpen, Bot, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';

const navItems = [
  { path: '/app', icon: Home, label: 'Dashboard' },
  { path: '/app/charts', icon: LineChart, label: 'Grafici' },
  { path: '/app/psychology', icon: Brain, label: 'Psicologia' },
  { path: '/app/journal', icon: BookOpen, label: 'Diario' },
  { path: '/app/ai', icon: Bot, label: 'AI' },
];

export const MobileNav = ({ onSearchClick }) => {
  const location = useLocation();

  return (
    <nav className="bottom-nav lg:hidden" data-testid="mobile-nav">
      <div className="flex items-center justify-around py-2 px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 min-w-[60px]",
                isActive && "bg-primary/10"
              )}
              data-testid={`mobile-nav-${item.label.toLowerCase()}`}
            >
              <div className="relative">
                <Icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                  />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </NavLink>
          );
        })}

        {/* Search Button */}
        <button
          onClick={onSearchClick}
          className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 min-w-[60px]"
          data-testid="mobile-search-btn"
        >
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <Search className="w-5 h-5 text-primary-foreground" />
          </div>
        </button>
      </div>
    </nav>
  );
};

export default MobileNav;
