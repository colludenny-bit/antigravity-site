import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { LineChart, Search, Star, TrendingUp, Save, FolderOpen, Trash2, Plus } from 'lucide-react';

const symbols = [
  { symbol: 'XAUUSD', name: 'Gold', category: 'Commodity' },
  { symbol: 'NAS100', name: 'Nasdaq 100', category: 'Index' },
  { symbol: 'SPX500', name: 'S&P 500', category: 'Index' },
  { symbol: 'DJI', name: 'Dow Jones', category: 'Index' },
  { symbol: 'EURUSD', name: 'EUR/USD', category: 'Forex' },
  { symbol: 'GBPUSD', name: 'GBP/USD', category: 'Forex' },
  { symbol: 'BTCUSD', name: 'Bitcoin', category: 'Crypto' },
  { symbol: 'ETHUSD', name: 'Ethereum', category: 'Crypto' },
];

const defaultLayouts = [
  { id: 'default-1', name: 'Trading Setup', symbols: ['XAUUSD', 'NAS100'], timeframe: 'H1' },
  { id: 'default-2', name: 'Crypto Watch', symbols: ['BTCUSD', 'ETHUSD'], timeframe: 'H4' },
];

export default function ChartsPage() {
  const { t } = useTranslation();
  const [selectedSymbol, setSelectedSymbol] = useState('XAUUSD');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState(['XAUUSD', 'NAS100']);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [currentTimeframe, setCurrentTimeframe] = useState('60');

  // Load saved layouts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('karion_chart_layouts');
    if (stored) {
      try {
        setSavedLayouts(JSON.parse(stored));
      } catch (e) {
        console.error('Error loading layouts:', e);
      }
    } else {
      setSavedLayouts(defaultLayouts);
    }
  }, []);

  // Save layouts to localStorage
  const saveLayoutsToStorage = (layouts) => {
    localStorage.setItem('karion_chart_layouts', JSON.stringify(layouts));
    setSavedLayouts(layouts);
  };

  const filteredSymbols = symbols.filter(s =>
    s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleFavorite = (symbol) => {
    setFavorites(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const saveCurrentLayout = () => {
    if (!newLayoutName.trim()) {
      toast.error('Inserisci un nome per il layout');
      return;
    }

    const newLayout = {
      id: `layout-${Date.now()}`,
      name: newLayoutName,
      symbols: favorites,
      selectedSymbol,
      timeframe: currentTimeframe,
      createdAt: new Date().toISOString()
    };

    const updated = [...savedLayouts, newLayout];
    saveLayoutsToStorage(updated);
    setShowSaveModal(false);
    setNewLayoutName('');
    toast.success(`Layout "${newLayoutName}" salvato!`);
  };

  const loadLayout = (layout) => {
    if (layout.symbols && layout.symbols.length > 0) {
      setFavorites(layout.symbols);
      setSelectedSymbol(layout.selectedSymbol || layout.symbols[0]);
    }
    if (layout.timeframe) {
      setCurrentTimeframe(layout.timeframe);
    }
    toast.success(`Layout "${layout.name}" caricato!`);
  };

  const deleteLayout = (layoutId) => {
    const updated = savedLayouts.filter(l => l.id !== layoutId);
    saveLayoutsToStorage(updated);
    toast.success('Layout eliminato');
  };

  const timeframes = [
    { value: '1', label: '1m' },
    { value: '5', label: '5m' },
    { value: '15', label: '15m' },
    { value: '60', label: '1H' },
    { value: '240', label: '4H' },
    { value: 'D', label: '1D' },
    { value: 'W', label: '1W' },
  ];

  return (
    <div className="space-y-6 fade-in" data-testid="charts-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <LineChart className="w-8 h-8 text-primary" />
              {t('nav.charts')}
            </h1>
            <p className="text-muted-foreground mt-1">Grafici TradingView interattivi con layout salvabili</p>
          </div>

          {/* Layout Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveModal(true)}
              className="rounded-xl"
            >
              <Save className="w-4 h-4 mr-2" />
              Salva Layout
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Saved Layouts Bar */}
      {savedLayouts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            <FolderOpen className="w-4 h-4 inline mr-1" />
            Layout:
          </span>
          {savedLayouts.map((layout) => (
            <div key={layout.id} className="flex items-center gap-1">
              <button
                onClick={() => loadLayout(layout)}
                className="px-3 py-1.5 bg-white/5 hover:bg-secondary rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {layout.name}
              </button>
              {!layout.id.startsWith('default-') && (
                <button
                  onClick={() => deleteLayout(layout.id)}
                  className="p-1 hover:bg-red-500/20 rounded-lg text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Timeframe Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Timeframe:</span>
        {timeframes.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setCurrentTimeframe(tf.value)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${currentTimeframe === tf.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/5 hover:bg-secondary'
              }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Symbol List */}
        <Card className="bg-card/80 border-border/50 lg:col-span-1" data-testid="symbol-list">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Strumenti</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca..."
                className="pl-10 bg-white/5"
                data-testid="symbol-search"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto scrollbar-thin">
            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs text-muted-foreground uppercase mb-2">Preferiti</h4>
                <div className="space-y-1">
                  {symbols.filter(s => favorites.includes(s.symbol)).map(s => (
                    <button
                      key={s.symbol}
                      onClick={() => setSelectedSymbol(s.symbol)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${selectedSymbol === s.symbol
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-white/5'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium">{s.symbol}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All Symbols */}
            <div className="space-y-1">
              {filteredSymbols.map(s => (
                <button
                  key={s.symbol}
                  onClick={() => setSelectedSymbol(s.symbol)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${selectedSymbol === s.symbol
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-white/5'
                    }`}
                  data-testid={`symbol-${s.symbol}`}
                >
                  <div className="text-left">
                    <span className="font-medium block">{s.symbol}</span>
                    <span className="text-xs text-muted-foreground">{s.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(s.symbol);
                    }}
                    className="p-1 hover:bg-secondary rounded"
                  >
                    <Star className={`w-4 h-4 ${favorites.includes(s.symbol)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-muted-foreground'
                      }`} />
                  </button>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* TradingView Chart */}
        <Card className="bg-card/80 border-border/50 lg:col-span-3" data-testid="chart-container">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {selectedSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="chart-container" style={{ height: '600px' }}>
              {/* TradingView Widget */}
              <iframe
                title="TradingView Chart"
                src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${selectedSymbol}&interval=${currentTimeframe}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=it&utm_source=localhost&utm_medium=widget&utm_campaign=chart&utm_term=${selectedSymbol}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Timeframe', value: timeframes.find(t => t.value === currentTimeframe)?.label || 'H1' },
          { label: 'Spread', value: '0.3' },
          { label: 'Session', value: 'London' },
          { label: 'Volatility', value: 'Medium' },
        ].map((item, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-lg font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Layout Modal */}
      {showSaveModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSaveModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="bg-card border border-border rounded-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Save className="w-5 h-5 text-primary" />
              Salva Layout
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Nome Layout</label>
                <Input
                  value={newLayoutName}
                  onChange={(e) => setNewLayoutName(e.target.value)}
                  placeholder="Es: Setup Morning Trading"
                  className="bg-white/5"
                />
              </div>
              <div className="p-3 bg-white/5 rounded-lg text-sm">
                <p className="text-muted-foreground">Verrà salvato:</p>
                <ul className="mt-1 space-y-1">
                  <li>• Simboli preferiti: {favorites.join(', ')}</li>
                  <li>• Simbolo corrente: {selectedSymbol}</li>
                  <li>• Timeframe: {timeframes.find(t => t.value === currentTimeframe)?.label}</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowSaveModal(false)} className="flex-1 rounded-xl">
                  Annulla
                </Button>
                <Button onClick={saveCurrentLayout} className="flex-1 rounded-xl">
                  <Save className="w-4 h-4 mr-2" />
                  Salva
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

