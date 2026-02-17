import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home,
  Plus,
  X,
  LineChart,
  Lightbulb,
  Newspaper,
  Activity,
  Users,
  Layers,
  Shield,
  DollarSign,
  Brain,
  BookOpen,
  Bot,
  TrendingUp,
  BarChart3,
  Calculator,
  FileText,
  Settings,
  User
} from 'lucide-react';
import { cn } from '../../lib/utils';

const launcherItems = [
  { path: '/app', label: 'Dashboard', icon: Home },
  { path: '/app/charts', label: 'Charts', icon: LineChart },
  { path: '/app/strategy', label: 'Strategy', icon: Lightbulb },
  { path: '/app/news', label: 'News', icon: Newspaper },
  { path: '/app/macro', label: 'Macro', icon: Activity },
  { path: '/app/cot', label: 'COT', icon: Users },
  { path: '/app/options', label: 'Options', icon: Layers },
  { path: '/app/risk', label: 'Risk', icon: Shield },
  { path: '/app/crypto', label: 'Crypto', icon: DollarSign },
  { path: '/app/psychology', label: 'Psychology', icon: Brain },
  { path: '/app/journal', label: 'Journal', icon: BookOpen },
  { path: '/app/ai', label: 'AI', icon: Bot },
  { path: '/app/montecarlo', label: 'Monte Carlo', icon: TrendingUp },
  { path: '/app/statistics', label: 'Statistics', icon: BarChart3 },
  { path: '/app/calculator', label: 'Calculator', icon: Calculator },
  { path: '/app/report', label: 'Report', icon: FileText },
  { path: '/app/settings', label: 'Settings', icon: Settings },
  { path: '/app/profile', label: 'Profile', icon: User }
];

export const MobileQuickDock = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const isHomeRoute = location.pathname === '/app';

  const goDashboardTop = () => {
    if (location.pathname !== '/app') {
      navigate('/app');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 120);
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 420);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setOpen(false);
  };

  const launcherGrid = useMemo(() => launcherItems, []);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Chiudi launcher"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/45 backdrop-blur-[8px]"
        />
      )}

      <div
        className="md:hidden fixed left-0 right-0 z-50 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0, y: -20 }}
              transition={{
                type: 'spring',
                stiffness: 350,
                damping: 25,
                mass: 0.6
              }}
              style={{ transformOrigin: 'top left', willChange: 'transform, opacity, filter' }}
              className="relative mx-3 mb-3 pointer-events-auto rounded-[24px] border border-white/20 bg-[linear-gradient(180deg,rgba(14,18,30,0.80)_0%,rgba(8,12,22,0.92)_100%)] shadow-[0_20px_56px_rgba(0,0,0,0.62)] backdrop-blur-[8px] px-3 py-3 overflow-hidden"
            >
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.09),transparent_55%)]" />
              <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none bg-gradient-to-t from-black/45 to-transparent" />

              <div className="relative grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto no-scrollbar">
                {launcherGrid.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={cn(
                        "flex items-center justify-center rounded-xl p-1 transition-all",
                        active ? "scale-[1.02]" : "hover:scale-[1.02]"
                      )}
                    >
                      <span
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center border",
                          active ? "bg-white/[0.10] border-white/35" : "bg-white/[0.05] border-white/15"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-6 h-6 text-white",
                            active
                              ? "drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]"
                              : "drop-shadow-[0_0_8px_rgba(255,255,255,0.75)]"
                          )}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-5 pointer-events-auto flex items-center justify-between">
          <button
            type="button"
            aria-label="Torna in cima alla dashboard"
            onClick={goDashboardTop}
            className={cn(
              "w-12 h-12 rounded-full border flex items-center justify-center shadow-[0_12px_28px_rgba(0,0,0,0.5)] transition-all backdrop-blur-[8px]",
              isHomeRoute
                ? "bg-[rgba(11,15,23,0.20)] border-white/40 ring-1 ring-white/25"
                : "bg-[rgba(11,15,23,0.20)] border-white/25"
            )}
          >
            <Home className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.75)]" />
          </button>

          <button
            type="button"
            aria-label={open ? "Chiudi launcher" : "Apri launcher"}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "w-12 h-12 rounded-full border flex items-center justify-center shadow-[0_12px_28px_rgba(0,0,0,0.5)] transition-all backdrop-blur-[8px]",
              open
                ? "bg-[rgba(11,15,23,0.20)] border-white/40 ring-1 ring-white/25"
                : "bg-[rgba(11,15,23,0.20)] border-white/25"
            )}
          >
            {open ? (
              <X className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.75)]" />
            ) : (
              <Plus className="w-5 h-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.75)]" />
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileQuickDock;
