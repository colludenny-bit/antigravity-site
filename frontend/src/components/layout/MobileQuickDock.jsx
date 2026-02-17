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
          className="md:hidden fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
        />
      )}

      <div
        className="md:hidden fixed left-0 right-0 z-50 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
      >
        {open && (
          <div className="mx-3 mb-3 pointer-events-auto rounded-[30px] border border-white/10 bg-[#0B0F17]/92 shadow-2xl backdrop-blur-xl px-3 py-4">
            <div className="grid grid-cols-3 gap-2.5 max-h-[52vh] overflow-y-auto no-scrollbar">
              {launcherGrid.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl px-2 py-2 transition-all",
                      active ? "bg-[#00D9A5]/14 border border-[#00D9A5]/30" : "bg-white/5 border border-white/10 hover:bg-white/10"
                    )}
                  >
                    <span
                      className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center border",
                        active ? "bg-[#00D9A5]/15 border-[#00D9A5]/35" : "bg-white/5 border-white/10"
                      )}
                    >
                      <Icon className={cn("w-5 h-5", active ? "text-[#00D9A5]" : "text-white/85")} />
                    </span>
                    <span className={cn("text-[11px] leading-tight text-center font-semibold", active ? "text-[#00D9A5]" : "text-white/85")}>
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
              "w-14 h-14 rounded-full border flex items-center justify-center shadow-xl transition-all",
              isHomeRoute ? "bg-[#00D9A5]/16 border-[#00D9A5]/40" : "bg-[#0B0F17]/88 border-white/15"
            )}
          >
            <Home className={cn("w-6 h-6", isHomeRoute ? "text-[#00D9A5]" : "text-white")} />
          </button>

          <button
            type="button"
            aria-label={open ? "Chiudi launcher" : "Apri launcher"}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "w-14 h-14 rounded-full border flex items-center justify-center shadow-xl transition-all",
              open ? "bg-[#0B0F17]/95 border-white/20" : "bg-[#0B0F17]/88 border-white/15"
            )}
          >
            {open ? <X className="w-6 h-6 text-white" /> : <Plus className="w-6 h-6 text-white" />}
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileQuickDock;
