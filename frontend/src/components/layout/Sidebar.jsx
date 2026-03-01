import React, { useState, useEffect, useRef } from 'react';
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
  LayoutGrid,
  Bitcoin,
  Calculator,
  LayoutDashboard,
  FlaskConical,
  BrainCircuit,
  Microscope
} from 'lucide-react';
import nuovoLogo from '../../assets/CUDWBCUDEW.png';

const baseNavItems = [
  { path: '/app', icon: LayoutGrid, label: 'Dashboard', iconClass: 'icon-home' },
  { path: '/app/research', icon: Microscope, label: 'Research', subtitle: 'Private', subtitleClass: 'text-[#C5A028]', iconClass: 'icon-research' },
  { path: '/app/backtest', icon: BrainCircuit, label: 'Quant Test', subtitle: 'Private', subtitleClass: 'text-[#C5A028]', iconClass: 'icon-backtest' },
  { path: '/app/crypto', icon: Bitcoin, label: 'Crypto', iconClass: 'icon-crypto' },
  { path: '/app/news', icon: Newspaper, label: 'News', iconClass: 'icon-news' },
  { path: '/app/macro', icon: Globe, label: 'Macro', iconClass: 'icon-macro' },
  { path: '/app/risk', icon: AlertTriangle, label: 'Risk', iconClass: 'icon-risk' },
  { path: '/app/cot', icon: TrendingUp, label: 'COT', iconClass: 'icon-cot' },
  { path: '/app/options', icon: Activity, label: 'Options', iconClass: 'icon-options' },
  { path: '/app/statistics', icon: BarChart3, label: 'Stats', iconClass: 'icon-stats' },

  { path: '/app/strategy', icon: Target, label: 'Strategia', iconClass: 'icon-strategy' },
  { path: '/app/montecarlo', icon: Dices, label: 'Monte Carlo', iconClass: 'icon-montecarlo' },
  { path: '/app/journal', icon: BookOpen, label: 'Journal', iconClass: 'icon-journal' },
  { path: '/app/psychology', icon: Brain, label: 'Psicologia', iconClass: 'icon-psychology' },
  { path: '/app/ai', icon: Sparkles, label: 'Karion AI', iconClass: 'icon-ai' },
  { path: '/app/calculator', icon: Calculator, label: 'Calcolatore', iconClass: 'icon-calculator' },
];


export const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navItems = baseNavItems;
  const [showQuickCalc, setShowQuickCalc] = useState(false);
  const [quickCalcParams, setQuickCalcParams] = useState(null);
  const [editableStop, setEditableStop] = useState("");
  const debounceRef = useRef(null);
  const [presetPips, setPresetPips] = useState(() => [
    Number(localStorage.getItem('calc_preset_0')) || 10,
    Number(localStorage.getItem('calc_preset_1')) || 20,
    Number(localStorage.getItem('calc_preset_2')) || 30,
  ]);
  const presetDebounceRefs = useRef([null, null, null]);

  const loadQuickCalcParams = () => {
    const accSize = Number(localStorage.getItem('calc_accountSize')) || 10000;
    const riskPct = Number(localStorage.getItem('calc_riskPercent')) || 1;
    const stopLoss = Number(localStorage.getItem('calc_stopLossPips')) || 20;
    const asset = localStorage.getItem('calc_asset') || 'EURUSD';

    let pipValue = 10;
    if (asset === 'XAUUSD' || asset === 'NAS100' || asset === 'US30') pipValue = 1;
    if (asset === 'USDJPY') pipValue = 9.1;

    const riskAmount = accSize * (riskPct / 100);
    const lotSize = riskAmount / (stopLoss * pipValue);
    setQuickCalcParams({
      lots: Math.floor(lotSize * 100) / 100,
      risk: riskAmount.toFixed(2),
      stop: stopLoss,
      asset: asset,
    });
  };

  // Poll local storage for calculator params
  useEffect(() => {
    let interval;
    if (showQuickCalc) {
      loadQuickCalcParams();
      setEditableStop(localStorage.getItem('calc_stopLossPips') || "20");
      interval = setInterval(loadQuickCalcParams, 3000);
    }
    return () => clearInterval(interval);
  }, [showQuickCalc]);

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
          "fixed top-[22px] bottom-3 left-4 z-50 overflow-hidden",
          "hidden lg:flex flex-col items-center pt-2 pb-4",
          "w-56 rounded-[24px]",
          "bg-black/25",
          "backdrop-blur-[14px]",
          "shadow-[0_18px_40px_rgba(0,0,0,0.42)]"
        )}
        style={{
          borderTopWidth: '2px', borderTopColor: 'rgba(255,255,255,0.35)',
          borderLeftWidth: '2px', borderLeftColor: 'rgba(255,255,255,0.35)',
          borderRightWidth: '1px', borderRightColor: 'rgba(255,255,255,0.10)',
          borderBottomWidth: '1px', borderBottomColor: 'rgba(255,255,255,0.10)',
          borderStyle: 'solid',
          zoom: 1.05
        }}
        data-testid="sidebar-desktop"
      >
        <div className="pointer-events-none absolute inset-0 z-0 rounded-[24px] bg-white/[0.055]" />

        {/* Logo */}
        <div className="mb-6 -mt-4 relative z-10 w-full px-0 overflow-visible">
          <button
            onClick={speakMarketAnalysis}
            className="flex items-center justify-center w-full cursor-pointer hover:scale-[1.05] transition-transform group"
            title="Click per analisi vocale mercati"
          >
            <img
              src={nuovoLogo}
              alt="Karion Logo"
              className="w-[235%] ml-0 h-auto object-contain transition-all duration-300"
            />
            <span className="absolute -bottom-2 right-4 text-[10px] text-[#00D9A5] opacity-0 group-hover:opacity-100 transition-opacity font-bold">
              🎤 Analizza
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex-1 flex flex-col items-center gap-1 w-full px-3 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <React.Fragment key={item.path}>
                <div className="w-full relative group/item">
                  <NavLink
                    to={item.path}
                    className={cn(
                      "w-full py-3 px-4 rounded-xl flex items-center gap-4 transition-all duration-200 border border-transparent",
                      "hover:bg-white/10 hover:border-white/15",
                      isActive && "bg-white/16 border-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_rgba(0,0,0,0.25)]"
                    )}
                  >
                    <Icon className={cn(
                      "w-[28px] h-[28px] sidebar-icon-animate transition-all flex-shrink-0",
                      item.label === 'Crypto' ? "text-[#C5A028]" : "text-white/72",
                      isActive && "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                    )} />
                    <span className="flex-1 min-w-0">
                      <span className={cn(
                        "block text-[16px] font-bold tracking-tight leading-tight",
                        isActive ? "text-white/95" : "text-white/65"
                      )}>
                        {item.label}
                      </span>
                      {item.subtitle && (
                        <span className={cn(
                          "block text-[10px] leading-none mt-1 font-semibold tracking-[0.12em] uppercase",
                          item.subtitleClass || "text-white/45"
                        )}>
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </NavLink>

                  {/* Independent Hit Area for Calcolatore Dropdown */}
                  {item.label === 'Calcolatore' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowQuickCalc(!showQuickCalc);
                      }}
                      className="absolute right-0 top-0 bottom-0 w-14 z-30 flex items-center justify-center transition-all hover:bg-white/5 rounded-r-xl"
                    >
                      <div className={cn(
                        "p-1 rounded-md transition-all transform",
                        showQuickCalc ? "rotate-180 bg-[#C5A028]/20" : "group-hover/item:bg-white/5"
                      )}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C5A028" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: showQuickCalc ? 1 : 0.65 }}>
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {item.label === 'Calcolatore' && showQuickCalc && quickCalcParams && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="w-full overflow-hidden mb-2 px-1"
                    >
                      <div
                        className="bg-black/60 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_rgba(0,0,0,0.25)] backdrop-blur-[14px] flex flex-col mt-1 relative z-50 overflow-hidden"
                        style={{
                          borderTop: '2px solid rgba(255,255,255,0.38)',
                          borderLeft: '2px solid rgba(255,255,255,0.38)',
                          borderRight: '1px solid rgba(255,255,255,0.08)',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {/* Lot Size Header */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[13px] font-semibold text-[#C5A028]/90 tracking-widest uppercase">Lot Size</span>
                          <span className="text-[20px] font-black text-[#C5A028] leading-none">{quickCalcParams.lots}</span>
                        </div>
                        {/* Risk Row */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.08]">
                          <span className="text-[13px] font-semibold text-white/70 tracking-wider uppercase">Rischio</span>
                          <span className="text-[15px] font-bold text-white/85">${quickCalcParams.risk}</span>
                        </div>
                        {/* SL pips — stepper minimal */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.08]">
                          <span className="text-[13px] font-semibold text-white/70 tracking-wider uppercase">SL pips</span>
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-center gap-0.5">
                              {/* Up */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  const n = Number(editableStop) + 1;
                                  if (debounceRef.current) clearTimeout(debounceRef.current);
                                  setEditableStop(String(n));
                                  localStorage.setItem('calc_stopLossPips', n);
                                  loadQuickCalcParams();
                                }}
                                className="p-0.5 hover:opacity-100 opacity-60 transition-opacity"
                              >
                                <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 7L6 2L11 7" stroke="#C5A028" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </button>
                              {/* Down */}
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  const n = Math.max(1, Number(editableStop) - 1);
                                  if (debounceRef.current) clearTimeout(debounceRef.current);
                                  setEditableStop(String(n));
                                  localStorage.setItem('calc_stopLossPips', n);
                                  loadQuickCalcParams();
                                }}
                                className="p-0.5 hover:opacity-100 opacity-60 transition-opacity"
                              >
                                <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M1 1L6 6L11 1" stroke="#C5A028" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </button>
                            </div>
                            {/* Editable number — no border, minimal */}
                            <input
                              type="number"
                              value={editableStop}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditableStop(val);
                                if (debounceRef.current) clearTimeout(debounceRef.current);
                                debounceRef.current = setTimeout(() => {
                                  const n = Number(val);
                                  if (n > 0) {
                                    localStorage.setItem('calc_stopLossPips', n);
                                    loadQuickCalcParams();
                                  }
                                }, 3500);
                              }}
                              className="w-10 bg-transparent text-[#C5A028] text-[17px] font-black text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                        {/* Quick Preset Pips — editable, 5s autosave */}
                        <div className="flex gap-1.5 px-3 py-2.5 border-t border-white/[0.08]">
                          {presetPips.map((pip, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                if (debounceRef.current) clearTimeout(debounceRef.current);
                                localStorage.setItem('calc_stopLossPips', pip);
                                setEditableStop(String(pip));
                                loadQuickCalcParams();
                              }}
                              className={cn(
                                "flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all border cursor-pointer flex items-center justify-center",
                                Number(editableStop) === pip
                                  ? "bg-[#C5A028]/25 border-[#C5A028]/50"
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                              )}
                            >
                              <input
                                type="number"
                                value={pip}
                                onClick={(e) => { /* bubble up to select SL */ }}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const updated = [...presetPips];
                                  updated[i] = val || 1;
                                  setPresetPips(updated);
                                  if (presetDebounceRefs.current[i]) clearTimeout(presetDebounceRefs.current[i]);
                                  presetDebounceRefs.current[i] = setTimeout(() => {
                                    localStorage.setItem(`calc_preset_${i}`, val || 1);
                                  }, 5000);
                                }}
                                className={cn(
                                  "w-full bg-transparent text-center text-[12px] font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-pointer",
                                  Number(editableStop) === pip ? "text-[#C5A028]" : "text-white/50"
                                )}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="relative z-10 flex flex-col items-center gap-1 mt-2 w-full px-3">
          <NavLink
            to="/welcome"
            className={cn(
              "w-full py-3 px-4 rounded-xl flex items-center gap-4 transition-all duration-200 border border-transparent hover:bg-white/10 hover:border-white/15",
              location.pathname === '/welcome' && "bg-white/16 border-white/22"
            )}
            title="Torna alla Home"
          >
            <Home className="w-[28px] h-[28px] text-white/72" />
            <span className="text-[15px] font-semibold text-white/64">Home</span>
          </NavLink>
          <NavLink
            to="/app/settings"
            className={cn(
              "w-full py-3 px-4 rounded-xl flex items-center gap-4 transition-all duration-200 border border-transparent hover:bg-white/10 hover:border-white/15",
              location.pathname === '/app/settings' && "bg-white/16 border-white/22"
            )}
          >
            <Settings className="w-[28px] h-[28px] text-white/72" />
            <span className="text-[15px] font-semibold text-white/64">Settings</span>
          </NavLink>
        </div>
      </aside >

      {/* Mobile Sidebar */}
      < aside
        className={
          cn(
            "fixed top-0 left-0 h-full w-64 z-50 overflow-hidden",
            "bg-black/95 backdrop-blur-2xl border-r border-white/10",
            "flex flex-col lg:hidden transition-transform duration-300 ease-out",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )
        }
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <span className="font-bold text-lg">Karion</span>
          <button onClick={onClose} className="p-2"><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all border border-transparent",
                    location.pathname === item.path && "bg-white/10 border-white/10 text-primary"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-red-400"><LogOut className="w-5 h-5" /> Esci</button>
        </div>
      </aside >
    </>
  );

};

export default Sidebar;
