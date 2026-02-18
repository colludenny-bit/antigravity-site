import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { TechCard } from '../ui/TechCard';

const FEED_ASSETS = [
  { code: 'NAS100', label: 'US100 (Nasdaq)', tvSymbol: 'CAPITALCOM:US100' },
  { code: 'SP500', label: 'US500 (S&P 500)', tvSymbol: 'CAPITALCOM:US500' },
  { code: 'XAUUSD', label: 'Gold', tvSymbol: 'FOREXCOM:XAUUSD' },
  { code: 'EURUSD', label: 'EURUSD', tvSymbol: 'FX:EURUSD' },
];

const buildTradingViewUrl = (tvSymbol) => {
  const params = new URLSearchParams({
    symbol: tvSymbol,
    interval: '15',
    hidesidetoolbar: '1',
    symboledit: '0',
    saveimage: '0',
    toolbarbg: 'f1f3f6',
    studies: '[]',
    theme: 'dark',
    style: '3',
    timezone: 'exchange',
    withdateranges: '0',
    showpopupbutton: '0',
    studies_overrides: '{}',
    overrides: '{}',
    enabled_features: '[]',
    disabled_features: '[]',
    locale: 'it',
    utm_source: 'karion',
    utm_medium: 'widget',
    utm_campaign: 'tv_feed',
    utm_term: tvSymbol,
  });

  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
};

export default function TradingViewFeedPage() {
  const widgets = useMemo(() => {
    return FEED_ASSETS.map((asset) => ({
      ...asset,
      src: buildTradingViewUrl(asset.tvSymbol),
    }));
  }, []);

  return (
    <div className="space-y-4" data-testid="tv-feed-page">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-[#00D9A5]" />
          <h1 className="text-xl font-bold text-white">TradingView Feed (Owner)</h1>
        </div>
        <p className="text-sm text-white/60">
          Feed live da widget TradingView, timeframe 15m e stile linea.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {widgets.map((asset) => (
          <TechCard key={asset.code} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-white">{asset.code}</h3>
                <p className="text-xs text-white/50">{asset.label}</p>
              </div>
              <span className="text-[10px] font-bold text-[#00D9A5] uppercase tracking-widest">TV 15m Line</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 h-[300px]">
              <iframe
                title={`tv-feed-${asset.code}`}
                src={asset.src}
                style={{ width: '100%', height: '100%', border: 'none' }}
                loading="lazy"
                allowFullScreen
              />
            </div>
          </TechCard>
        ))}
      </div>
    </div>
  );
}
