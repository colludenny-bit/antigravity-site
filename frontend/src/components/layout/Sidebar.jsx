import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';
import {
  Home,
  Target,
  LineChart,
  Brain,
  BookOpen,
  Users,
  Sparkles,
  Settings,
  LogOut,
  Moon,
  Sun,
  X,
  TrendingUp,
  Newspaper,
  AlertTriangle,
  BarChart3,
  Dices,
  Activity,
  Globe,
  Bitcoin,
  Calculator,
  Gauge,
  LayoutDashboard
} from 'lucide-react';
import kaironBull from '../../assets/kairon-bull.png';

const navItems = [
  { path: '/app', icon: LayoutDashboard, label: 'Dashboard', iconClass: 'icon-home' },
  { path: '/app/crypto', icon: Bitcoin, label: 'Crypto', iconClass: 'icon-crypto' },
  { path: '/app/statistics', icon: BarChart3, label: 'Grafici', iconClass: 'icon-stats' },
  { path: '/app/news', icon: Newspaper, label: 'News', iconClass: 'icon-news' },
  { path: '/app/macro', icon: Globe, label: 'Macro', iconClass: 'icon-macro' },
  { path: '/app/risk', icon: AlertTriangle, label: 'Risk', iconClass: 'icon-risk' },
  { path: '/app/cot', icon: TrendingUp, label: 'COT', iconClass: 'icon-cot' },
  { path: '/app/options', icon: Activity, label: 'Options', iconClass: 'icon-options' },
  { path: '/app/statistics', icon: LineChart, label: 'Stats', iconClass: 'icon-stats' },

  { path: '/app/strategy', icon: Target, label: 'Strategia', iconClass: 'icon-strategy' },
  { path: '/app/montecarlo', icon: Dices, label: 'Monte Carlo', iconClass: 'icon-montecarlo' },
  { path: '/app/calculator', icon: Calculator, label: 'Calcolatore', iconClass: 'icon-calculator' },
  { path: '/app/journal', icon: BookOpen, label: 'Journal', iconClass: 'icon-journal' },
  { path: '/app/psychology', icon: Brain, label: 'Psicologia', iconClass: 'icon-psychology' },
  { path: '/app/ai', icon: Sparkles, label: 'Karion AI', iconClass: 'icon-ai' },
];


export const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Voice analysis function for logo click
  const speakMarketAnalysis = () => {
    if (!window.speechSynthesis) return;

    // Stop any current speech
    window.speechSynthesis.cancel();

    const hour = new Date().getHours();
    let greeting = 'Buongiorno';
    if (hour >= 12 && hour < 17) greeting = 'Buon pomeriggio';
    else if (hour >= 17) greeting = 'Buonasera';

    const analyses = [
      `${greeting} trader! Oggi i mercati mostrano volatilità moderata. Il VIX è stabile, buon momento per operazioni trend-following. Ricorda di rispettare il tuo risk management.`,
      `${greeting}! Sessione interessante oggi. I volumi sono sopra la media, attenzione ai livelli chiave di supporto e resistenza. Mantieni disciplina nelle entrate.`,
      `${greeting}! Il sentiment è positivo sui tech. Le crypto mostrano correlazione con l'equity. Guarda i setup delle strategie più performanti prima di operare.`,
      `${greeting}! Giornata di consolidamento sui mercati. Perfetta per rivedere il journal e analizzare le performance della settimana. La pazienza paga.`
    ];

    const text = analyses[Math.floor(Math.random() * analyses.length)];

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const italianVoice = voices.find(v => v.lang.startsWith('it'));
    if (italianVoice) utterance.voice = italianVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar - Premium Dark Theme */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50",
          "hidden lg:flex flex-col items-center py-4",
          "w-20",
          "bg-gradient-to-b from-[#0a0e12] to-[#060809]",
          "border-r border-[#00D9A5]/15",
          "backdrop-blur-2xl",
          "shadow-[4px_0_30px_rgba(0,217,165,0.05)]"
        )}
        data-testid="sidebar-desktop"
      >
        {/* Logo - Clickable for voice analysis */}
        <div className="mb-3 relative z-10 overflow-visible">
          <button
            onClick={speakMarketAnalysis}
            className="w-20 h-20 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform group"
            style={{ marginLeft: '4px' }}
            title="Click per analisi vocale mercati"
            data-testid="logo-voice-btn"
          >
            <img
              src={kaironBull}
              alt="Logo"
              className="w-28 h-28 object-contain transition-all"
              style={{ transform: 'translateX(12px)' }}
            />
            <span className="absolute -bottom-1 text-[8px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">
              🎤 Analizza
            </span>
          </button>
        </div>

        {/* Navigation Icons with Labels */}
        <nav className="flex-1 flex flex-col items-center gap-1 w-full px-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200",
                  "hover:bg-primary/10",
                  isActive && "bg-primary/20"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <Icon className={cn(
                  "w-7 h-7 sidebar-icon-animate",
                  isActive ? item.iconClass : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-[9px] font-medium leading-tight text-center",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-1 mt-2 w-full px-1">
          {/* Home Button */}
          <NavLink
            to="/welcome"
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors hover:bg-secondary",
              location.pathname === '/welcome' && "bg-primary/20"
            )}
            title="Torna alla Home"
            data-testid="nav-home"
          >
            <Home className={cn(
              "w-7 h-7",
              location.pathname === '/welcome' ? "text-primary" : "text-muted-foreground"
            )} />
          </NavLink>

          {/* Settings Only */}
          <NavLink
            to="/app/settings"
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors hover:bg-secondary",
              location.pathname === '/app/settings' && "bg-primary/20"
            )}
            data-testid="nav-settings"
          >
            <Settings className={cn(
              "w-7 h-7",
              location.pathname === '/app/settings' ? "text-primary" : "text-muted-foreground"
            )} />
          </NavLink>
        </div>
      </aside>

      {/* Mobile Sidebar - Full Width with Labels */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 bg-card/95 backdrop-blur-xl border-r border-border z-50",
          "flex flex-col lg:hidden transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar-mobile"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden">
              <img
                src="https://customer-assets.emergentagent.com/job_38b9976a-3c50-4a7a-8095-13c48833e390/artifacts/czwo9e5l_K%20%28Logo%29%20copia.png"
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-bold text-lg tracking-tight">Karion</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            data-testid="sidebar-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                {(user.name?.charAt(0) || '').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Theme Toggle */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4" />
              <span className="text-sm">Modalità Notte</span>
            </div>
            <button
              onClick={toggleTheme}
              className={cn(
                "w-11 h-6 rounded-full transition-colors relative",
                theme === 'dark' ? "bg-primary" : "bg-secondary"
              )}
            >
              <span className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                theme === 'dark' ? "translate-x-5" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                      "hover:bg-secondary/80",
                      isActive && "bg-primary/10 text-primary border border-primary/20"
                    )}
                  >
                    <Icon className={cn("w-5 h-5 sidebar-icon-animate", isActive ? item.iconClass : "")} />
                    <span className={cn("font-medium", isActive && "text-primary")}>
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
                      />
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          <NavLink
            to="/app/settings"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              "hover:bg-secondary/80",
              location.pathname === '/app/settings' && "bg-primary/10 text-primary"
            )}
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">Impostazioni</span>
          </NavLink>

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Esci</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
