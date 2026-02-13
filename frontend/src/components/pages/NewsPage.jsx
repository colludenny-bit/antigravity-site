import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, Clock, TrendingUp, RefreshCw, Brain, X, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMarket } from '../../contexts/MarketContext';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

// --- Components ---
const countries = [
  { code: 'us', name: 'Stati Uniti', flag: '🇺🇸' },
  { code: 'eu', name: 'Europa', flag: '🇪🇺' },
  { code: 'gb', name: 'Regno Unito', flag: '🇬🇧' },
  { code: 'jp', name: 'Giappone', flag: '🇯🇵' },
  { code: 'cn', name: 'Cina', flag: '🇨🇳' },
];

const BullHeadIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={cn("w-4 h-4", className)} fill="currentColor">
    <path d="M2 4c0 0 1-3 4-2.5c2 0.3 3 2 3.5 3.5M22 4c0 0-1-3-4-2.5c-2 0.3-3 2-3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <ellipse cx="12" cy="14" rx="7" ry="6" />
    <circle cx="9" cy="13" r="1.2" fill="white" />
    <circle cx="15" cy="13" r="1.2" fill="white" />
  </svg>
);

// Initial Calendar Seed
const initialCalendar = [
  { id: 1, time: '13:30', country: 'us', flag: '🇺🇸', event: 'Non-Farm Payrolls', importance: 3, actual: '353K', forecast: '185K', released: true },
  { id: 2, time: '14:00', country: 'eu', flag: '🇪🇺', event: 'Lagarde Speech', importance: 3, actual: 'Hawkish', forecast: '-', released: true },
  { id: 3, time: '15:45', country: 'us', flag: '🇺🇸', event: 'Services PMI', importance: 2, actual: '52.5', forecast: '52.0', released: true },
  { id: 4, time: '19:00', country: 'us', flag: '🇺🇸', event: 'FOMC Statement', importance: 3, actual: null, forecast: '-', released: false },
  { id: 5, time: '19:30', country: 'us', flag: '🇺🇸', event: 'Powell Presser', importance: 3, actual: null, forecast: '-', released: false },
  { id: 6, time: '21:00', country: 'jp', flag: '🇯🇵', event: 'GDP QoQ', importance: 2, actual: null, forecast: '0.3%', released: false },
  { id: 7, time: '22:30', country: 'us', flag: '🇺🇸', event: 'API Oil Stock', importance: 2, actual: null, forecast: '-2.1M', released: false },
  { id: 8, time: '23:00', country: 'cn', flag: '🇨🇳', event: 'Caixin Services PMI', importance: 2, actual: null, forecast: '52.9', released: false },
];

const LiveNewsItem = ({ news, onClick }) => (
  <motion.div
    layout
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    onClick={() => onClick(news)}
    className="p-3 bg-white/5 border border-white/10 rounded-lg mb-2 hover:bg-white/10 transition-colors cursor-pointer group subtle-divider tab-border-highlight glass-edge fine-gray-border"
  >
    <div className="flex justify-between items-start mb-1">
      <span className="text-[10px] text-muted-foreground font-mono">{news.time}</span>
      <div className="flex gap-2">
        {news.currency && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
            news.currency === 'USD' ? "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20" : "bg-white/5 text-white/40"
          )}>
            {news.currency}
          </span>
        )}
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
          news.sentiment === 'Bullish' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        )}>
          {news.sentiment}
        </span>
      </div>
    </div>
    <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{news.title}</p>
    <div className="mt-2 flex items-center justify-between">
      {news.impact === 'High' && (
        <div className="text-[10px] flex items-center gap-1 text-red-400 font-bold">
          <TrendingUp className="w-3 h-3" /> HIGH IMPACT
        </div>
      )}
      <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
    </div>
  </motion.div>
);

// AI Analysis Modal
const AnalysisModal = ({ news, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-card border border-primary/20 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative"
      onClick={e => e.stopPropagation()}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
      <Button variant="ghost" size="icon" className="absolute top-2 right-2 rounded-full hover:bg-white/10" onClick={onClose}>
        <X className="w-4 h-4" />
      </Button>

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 text-primary mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm tracking-wider">KARION AI ANALYSIS</span>
        </div>

        <h3 className="text-xl font-bold leading-tight">{news.title}</h3>

        <div className="space-y-3 bg-white/5 p-4 rounded-xl text-sm leading-relaxed text-muted-foreground border border-white/5">
          <p>
            <strong className="text-white">Impatto:</strong> Questa notizia ha implicazioni {news.sentiment.toLowerCase()} a breve termine.
            La struttura di mercato suggerisce cautela.
          </p>
          <p>
            <strong className="text-white">Livelli Chiave:</strong> Monitorare la reazione sui massimi/minimi intraday.
            {news.impact === 'High' ? " Possibile spike di volatilità in arrivo." : " Impatto limitato sulla price action."}
          </p>
        </div>

        <Button className="w-full gap-2 rounded-xl" onClick={onClose}>
          <Sparkles className="w-4 h-4" /> Ho capito
        </Button>
      </div>
    </motion.div>
  </div>
);

export default function NewsPage() {
  const { marketData } = useMarket();
  const [selectedCountries, setSelectedCountries] = useState(['us', 'eu', 'gb', 'jp', 'cn']);
  const [calendarData, setCalendarData] = useState(initialCalendar);
  const [analyzingNews, setAnalyzingNews] = useState(null);

  const liveNews = marketData?.news || [];

  // Simulate Calendar Releases
  useEffect(() => {
    const interval = setInterval(() => {
      setCalendarData(prev => {
        const pendingIndex = prev.findIndex(e => !e.released);
        if (pendingIndex === -1) return prev;
        const newData = [...prev];
        const event = newData[pendingIndex];
        const isNumeric = event.forecast && !event.forecast.includes('%') && !event.forecast.includes('-');
        const actual = isNumeric
          ? (parseFloat(event.forecast) + (Math.random() - 0.5)).toFixed(1) + (event.forecast.replace(/[0-9.]/g, ''))
          : ['Better', 'Worse', 'In Line'][Math.floor(Math.random() * 3)];
        newData[pendingIndex] = { ...event, released: true, actual: actual };
        return newData;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col fade-in font-apple" data-testid="news-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Newspaper className="w-8 h-8 text-primary" />
            Global News & Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time Economic Events & Breaking News
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-lg animate-pulse">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-primary">LIVE FEED ACTIVE</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
        {/* Calendar */}
        <div className="lg:col-span-2 flex flex-col h-full bg-card/80 border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-white/5 flex justify-between items-center">
            <h3 className="font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Economic Calendar
            </h3>
            <div className="flex gap-2">
              {countries.map(c => (
                <button
                  key={c.code}
                  onClick={() => setSelectedCountries(prev => prev.includes(c.code) ? prev.filter(x => x !== c.code) : [...prev, c.code])}
                  className={cn("text-lg opacity-50 hover:opacity-100 transition-opacity grayscale hover:grayscale-0", selectedCountries.includes(c.code) && "opacity-100 scale-110 grayscale-0")}
                >
                  {c.flag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {calendarData.filter(e => selectedCountries.includes(e.country)).map(event => (
              <motion.div
                layout
                key={event.id}
                className={cn(
                  "grid grid-cols-12 gap-2 p-3 rounded-lg items-center border transition-all",
                  event.released
                    ? "bg-white/5 border-transparent opacity-80"
                    : "bg-card border-primary/20 shadow-[0_0_10px_rgba(var(--primary),0.1)] scale-[1.01]"
                )}
              >
                <div className="col-span-1 text-xs text-muted-foreground font-mono">{event.time}</div>
                <div className="col-span-1 text-xl drop-shadow-md">{event.flag}</div>
                <div className="col-span-6 font-medium text-sm flex items-center gap-2">
                  {event.event}
                  {event.importance === 3 && <BullHeadIcon className="text-red-500" />}
                </div>
                <div className="col-span-2 text-xs text-right text-muted-foreground">{event.forecast}</div>

                <div className="col-span-2 text-right">
                  <AnimatePresence mode="wait">
                    {event.released ? (
                      <motion.span
                        key="released"
                        initial={{ scale: 1.5, opacity: 0, color: '#fff' }}
                        animate={{ scale: 1, opacity: 1, color: 'var(--primary)' }}
                        className="text-sm font-bold text-primary"
                      >
                        {event.actual}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="pending"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-xs text-muted-foreground italic"
                      >
                        Pending...
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Live Wire */}
        <div className="flex flex-col h-full bg-card/80 border border-border rounded-xl overflow-hidden shadow-lg shadow-black/20">
          <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-transparent flex justify-between items-center">
            <h3 className="font-bold text-primary flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin-slow" /> Live Wire
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 bg-background/50 rounded text-primary/80">
              {liveNews.length} UPDATES
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <AnimatePresence initial={false}>
              {liveNews.map(news => (
                <LiveNewsItem key={news.id} news={news} onClick={setAnalyzingNews} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {analyzingNews && <AnalysisModal news={analyzingNews} onClose={() => setAnalyzingNews(null)} />}
      </AnimatePresence>
    </div>
  );
}
