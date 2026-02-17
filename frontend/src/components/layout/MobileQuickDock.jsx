import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
        {open && (
          <div className="mx-3 mb-3 pointer-events-auto rounded-[24px] border border-white/20 bg-[rgba(11,15,23,0.20)] shadow-[0_16px_50px_rgba(0,0,0,0.55)] backdrop-blur-[8px] px-2.5 py-3">
            <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto no-scrollbar">
              {launcherGrid.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl px-1.5 py-1.5 transition-all",
                      active ? "bg-white/12 border border-white/35" : "bg-white/5 border border-white/15 hover:bg-white/10"
                    )}
                  >
                    <span
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center border",
                        active ? "bg-white/12 border-white/35" : "bg-white/8 border-white/20"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 text-white",
                          active ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]" : "drop-shadow-[0_0_6px_rgba(255,255,255,0.55)]"
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] leading-tight text-center font-semibold text-white",
                        active ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.65)]" : "opacity-90"
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
