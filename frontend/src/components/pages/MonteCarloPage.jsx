import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Dices, Play, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, Target, Percent, DollarSign, Hash, Download,
  Gauge, ArrowDownRight, Calculator, FileText
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import jsPDF from 'jspdf';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Animated Dice Component
const AnimatedDice = ({ isAnimating }) => {
  const dots = [
    [[1, 1]], // 1
    [[0, 0], [2, 2]], // 2
    [[0, 0], [1, 1], [2, 2]], // 3
    [[0, 0], [0, 2], [2, 0], [2, 2]], // 4
    [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]], // 5
    [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]], // 6
  ];

  const [value, setValue] = useState(5);

  useEffect(() => {
    if (isAnimating) {
      const interval = setInterval(() => {
        setValue(Math.floor(Math.random() * 6));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isAnimating]);

  return (
    <motion.div
      className="w-20 h-20 bg-gradient-to-br from-primary to-primary/50 rounded-xl p-2 relative shadow-2xl"
      animate={isAnimating ? {
        rotateX: [0, 360],
        rotateY: [0, 360],
        scale: [1, 1.1, 1]
      } : {}}
      transition={{ duration: 0.5, repeat: isAnimating ? Infinity : 0 }}
    >
      <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-1 p-1">
        {[0, 1, 2].map(row =>
          [0, 1, 2].map(col => {
            const hasDot = dots[value].some(([r, c]) => r === row && c === col);
            return (
              <div
                key={`${row}-${col}`}
                className={cn(
                  "rounded-full transition-all duration-100",
                  hasDot ? "bg-white shadow-inner" : "bg-transparent"
                )}
              />
            );
          })
        )}
      </div>
    </motion.div>
  );
};

// Loading Animation Component
const LoadingAnimation = ({ isLoading, progress }) => {
  const lines = React.useMemo(() => {
    if (isLoading && progress > 30) {
      const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
      return Array.from({ length: 10 }, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        delay: i * 0.15,
        points: Array.from({ length: 100 }, (_, j) => ({
          x: j,
          y: 50 + (Math.sin(j * 0.1 + i) * 20) + (Math.random() * 10)
        }))
      }));
    }
    return [];
  }, [isLoading, progress > 30]);

  if (!isLoading) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center"
    >
      {/* Dice Animation */}
      <div className="flex gap-4 mb-8">
        <AnimatedDice isAnimating={true} />
        <AnimatedDice isAnimating={true} />
      </div>

      <h3 className="text-xl font-bold text-primary mb-2">Karion sta simulando...</h3>
      <p className="text-muted-foreground text-sm mb-6">Calcolando 10.000 scenari di equity</p>

      {/* Progress Bar */}
      <div className="w-64 h-2 bg-secondary rounded-full overflow-hidden mb-8">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-emerald-500"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Equity Lines Preview */}
      {progress > 30 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-96 h-32"
        >
          <ResponsiveContainer>
            <LineChart data={lines[0]?.points || []}>
              {lines.map((line, i) => (
                <Line
                  key={line.id}
                  type="monotone"
                  dataKey="y"
                  data={line.points}
                  stroke={line.color}
                  strokeWidth={1}
                  dot={false}
                  opacity={0.6}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </motion.div>
  );
};

// Stat Card Component with improved overflow handling
const StatCard = ({ icon: Icon, label, value, subValue, color = 'primary', format = 'default' }) => {
  const colorClasses = {
    primary: 'text-primary',
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400'
  };

  let displayValue = value;
  let fullValue = value;
  if (format === 'currency') {
    fullValue = typeof value === 'number' ? `$${value.toLocaleString()}` : value;
    // Compact format for large numbers
    if (typeof value === 'number' && value >= 1000000) {
      displayValue = `$${(value / 1000000).toFixed(2)}M`;
    } else if (typeof value === 'number' && value >= 10000) {
      displayValue = `$${(value / 1000).toFixed(1)}K`;
    } else {
      displayValue = fullValue;
    }
  } else if (format === 'percent') {
    displayValue = typeof value === 'number' ? `${value.toFixed(2)}%` : value;
    fullValue = displayValue;
  }

  return (
    <div className="p-3 md:p-4 bg-white/5 rounded-xl h-full overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <Icon className={cn("w-4 h-4 md:w-5 md:h-5 flex-shrink-0", colorClasses[color])} />
        {subValue && <span className="text-[10px] md:text-xs text-muted-foreground truncate ml-1">{subValue}</span>}
      </div>
      <p
        className={cn(
          "text-lg md:text-xl lg:text-2xl font-bold truncate cursor-default",
          colorClasses[color]
        )}
        title={fullValue}
      >
        {displayValue}
      </p>
      <p className="text-[10px] md:text-xs text-muted-foreground mt-1 truncate">{label}</p>
    </div>
  );
};

export default function MonteCarloPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [importedStrategy, setImportedStrategy] = useState(null);
  const [params, setParams] = useState({
    win_rate: 55,
    avg_win: 2,
    avg_loss: 1,
    num_trades: 100,
    initial_capital: 10000,
    risk_per_trade: 1
  });

  // Load imported strategy from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('monteCarloStrategy');
    if (stored) {
      try {
        const strategy = JSON.parse(stored);
        setImportedStrategy(strategy);
        setParams(prev => ({
          ...prev,
          win_rate: strategy.winRate,
          avg_win: strategy.avgWin,
          avg_loss: strategy.avgLoss
        }));
        // Clear after loading
        localStorage.removeItem('monteCarloStrategy');
      } catch (e) {
        console.error('Error loading strategy:', e);
      }
    }
  }, []);

  const runSimulation = async () => {
    setLoading(true);
    setLoadingProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => Math.min(prev + Math.random() * 15, 95));
    }, 200);

    try {
      const res = await axios.post(`${API}/montecarlo/simulate`, {
        ...params,
        win_rate: params.win_rate / 100,
        risk_per_trade: params.risk_per_trade / 100
      });

      setLoadingProgress(100);
      setTimeout(() => {
        setResults(res.data);
        setLoading(false);
        toast.success('Simulazione completata!');
      }, 500);
    } catch (error) {
      toast.error('Errore nella simulazione');
      setLoading(false);
    } finally {
      clearInterval(progressInterval);
    }
  };

  // Calculate additional metrics from results
  const calculateMetrics = () => {
    if (!results) return {};

    const expectancy = (params.win_rate / 100 * params.avg_win) - ((1 - params.win_rate / 100) * params.avg_loss);
    const profitFactor = (params.win_rate / 100 * params.avg_win) / ((1 - params.win_rate / 100) * params.avg_loss);
    const kellyPercent = ((params.win_rate / 100 * params.avg_win) - (1 - params.win_rate / 100)) / params.avg_win * 100;

    return {
      expectancy: expectancy.toFixed(3),
      profitFactor: profitFactor.toFixed(2),
      kellyPercent: Math.max(0, kellyPercent).toFixed(2),
      avgReturn: results.avg_final_capital ?
        ((results.avg_final_capital - params.initial_capital) / params.initial_capital * 100).toFixed(2) : 0,
      medianReturn: results.median_final_capital ?
        ((results.median_final_capital - params.initial_capital) / params.initial_capital * 100).toFixed(2) : 0
    };
  };

  const metrics = calculateMetrics();

  // Format equity curves for chart
  const chartData = results?.equity_curves?.[0]?.map((value, i) => ({
    trade: i,
    ...Object.fromEntries(
      results.equity_curves.slice(0, 50).map((curve, j) => [`sim${j}`, curve[i]])
    )
  })) || [];

  const curveColors = [
    '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'
  ];

  // PDF Export Function
  const exportPDF = () => {
    if (!results) {
      toast.error('Prima lancia la simulazione!');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Helper function
    const addLine = (text, x = 15, fontSize = 10, isBold = false) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.text(text, x, y);
      y += fontSize * 0.5 + 2;
    };

    const addSection = (title) => {
      y += 5;
      doc.setDrawColor(34, 197, 94);
      doc.setLineWidth(0.5);
      doc.line(15, y, pageWidth - 15, y);
      y += 8;
      addLine(title, 15, 14, true);
      y += 3;
    };

    // Header
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(34, 197, 94);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('KARION', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text('Monte Carlo Simulation Report', pageWidth / 2, 30, { align: 'center' });

    y = 50;
    doc.setTextColor(0, 0, 0);

    // Strategy Parameters Section
    addSection('📊 Strategy Parameters');
    addLine(`Win Rate: ${params.win_rate}%`);
    addLine(`Average Win: ${params.avg_win}R`);
    addLine(`Average Loss: ${params.avg_loss}R`);
    addLine(`Risk per Trade: ${params.risk_per_trade}%`);
    addLine(`Initial Capital: $${params.initial_capital.toLocaleString()}`);
    addLine(`Number of Trades: ${params.num_trades}`);

    // Overview Results Section
    addSection('📈 Simulation Results (10,000 scenarios)');
    addLine(`Average Final Capital: $${results.avg_final_capital?.toLocaleString() || 'N/A'}`);
    addLine(`Median Final Capital: $${results.median_final_capital?.toLocaleString() || 'N/A'}`);
    addLine(`Best Case (Top 1%): $${results.max_final_capital?.toLocaleString() || 'N/A'}`);
    addLine(`Worst Case (Bottom 1%): $${results.min_final_capital?.toLocaleString() || 'N/A'}`);
    addLine(`Ruin Probability: ${results.bankruptcy_rate?.toFixed(2) || 0}%`);
    addLine(`Max Drawdown (avg): ${results.avg_max_drawdown?.toFixed(2) || 0}%`);

    // Key Metrics Section
    addSection('🎯 Key Metrics');
    addLine(`Expectancy: ${metrics.expectancy}R`);
    addLine(`Profit Factor: ${metrics.profitFactor}`);
    addLine(`Kelly Criterion: ${metrics.kellyPercent}%`);
    addLine(`Average ROI: ${metrics.avgReturn}%`);
    addLine(`Median ROI: ${metrics.medianReturn}%`);
    addLine(`Risk/Reward Ratio: ${(params.avg_win / params.avg_loss).toFixed(2)}`);

    // AI Analysis Section
    addSection('🤖 AI Analysis');
    const analysisLines = [];

    if (parseFloat(metrics.expectancy) > 0.3) {
      analysisLines.push('✅ Strategia con edge positivo significativo');
    } else if (parseFloat(metrics.expectancy) > 0) {
      analysisLines.push('⚠️ Edge positivo ma marginale, aumentare sample size');
    } else {
      analysisLines.push('❌ Edge negativo, rivedere strategia');
    }

    if (results.bankruptcy_rate < 5) {
      analysisLines.push('✅ Rischio di rovina molto basso');
    } else if (results.bankruptcy_rate < 15) {
      analysisLines.push('⚠️ Rischio moderato, considerare riduzione size');
    } else {
      analysisLines.push('❌ Rischio elevato, parametri aggressivi');
    }

    if (parseFloat(metrics.profitFactor) > 1.5) {
      analysisLines.push('✅ Profit factor eccellente');
    } else if (parseFloat(metrics.profitFactor) > 1) {
      analysisLines.push('⚠️ Profit factor accettabile');
    }

    const kellySuggested = Math.min(parseFloat(metrics.kellyPercent) / 2, 5);
    analysisLines.push(`💡 Position sizing suggerito: ${kellySuggested.toFixed(1)}% (Half-Kelly)`);

    analysisLines.forEach(line => addLine(line));

    // Footer
    y = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated by Karion Trading OS • ${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}`, pageWidth / 2, y, { align: 'center' });

    // Save
    const filename = `karion_montecarlo_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
    toast.success(`PDF esportato: ${filename}`);
  };


  return (
    <div className="space-y-6 fade-in" data-testid="montecarlo-page">
      {/* Loading Animation */}
      <AnimatePresence>
        {loading && <LoadingAnimation isLoading={loading} progress={loadingProgress} />}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Dices className="w-8 h-8 text-primary" />
          Monte Carlo Simulation
          {importedStrategy && (
            <span className="text-lg font-normal text-primary ml-2">
              — {importedStrategy.name}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground mt-1">
          {importedStrategy
            ? `Simulazione per strategia: ${importedStrategy.name}`
            : 'Analisi probabilistica con 10.000 scenari'
          }
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parameters Panel */}
        <Card className="bg-card/80 border-border/50" data-testid="mc-params">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Parametri Strategia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Win Rate */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Win Rate</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={params.win_rate}
                    onChange={(e) => setParams({ ...params, win_rate: parseFloat(e.target.value) || 0 })}
                    className="w-20 h-8 text-sm bg-white/5 text-right"
                    step={0.1}
                    min={1}
                    max={99}
                  />
                  <span className="text-primary font-bold">%</span>
                </div>
              </div>
              <Slider
                value={[params.win_rate]}
                onValueChange={([v]) => setParams({ ...params, win_rate: v })}
                max={90}
                min={10}
                step={0.1}
              />
            </div>

            {/* Average Win/Loss */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm">Avg Win (R)</Label>
                <Input
                  type="number"
                  value={params.avg_win}
                  onChange={(e) => setParams({ ...params, avg_win: parseFloat(e.target.value) || 0 })}
                  step={0.1}
                  min={0.1}
                  className="bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Avg Loss (R)</Label>
                <Input
                  type="number"
                  value={params.avg_loss}
                  onChange={(e) => setParams({ ...params, avg_loss: parseFloat(e.target.value) || 0 })}
                  step={0.1}
                  min={0.1}
                  className="bg-white/5"
                />
              </div>
            </div>

            {/* Risk Per Trade - Extended Range */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Risk per Trade</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={params.risk_per_trade}
                    onChange={(e) => setParams({ ...params, risk_per_trade: parseFloat(e.target.value) || 0 })}
                    className="w-24 h-8 text-sm bg-white/5 text-right"
                    step={0.01}
                    min={0.01}
                    max={20}
                  />
                  <span className="text-primary font-bold">%</span>
                </div>
              </div>
              <Slider
                value={[params.risk_per_trade * 10]}
                onValueChange={([v]) => setParams({ ...params, risk_per_trade: v / 10 })}
                max={100}
                min={0.1}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Range: 0.01% - 10%
              </p>
            </div>

            {/* Initial Capital */}
            <div className="space-y-2">
              <Label className="text-sm">Capitale Iniziale</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={params.initial_capital}
                  onChange={(e) => setParams({ ...params, initial_capital: parseFloat(e.target.value) || 0 })}
                  className="bg-white/5 pl-9"
                />
              </div>
            </div>

            {/* Number of Trades */}
            <div className="space-y-2">
              <Label className="text-sm">Numero Trade</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={params.num_trades}
                  onChange={(e) => setParams({ ...params, num_trades: parseInt(e.target.value) || 0 })}
                  className="bg-white/5 pl-9"
                />
              </div>
            </div>

            {/* Run Button */}
            <Button
              onClick={runSimulation}
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90"
              data-testid="simulate-btn"
            >
              <Play className="w-4 h-4 mr-2" />
              Launch Simulation
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="bg-card/80 border-border/50 lg:col-span-2" data-testid="mc-results">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Risultati Simulazione
              </CardTitle>
              {results && (
                <Button onClick={exportPDF} variant="outline" size="sm" className="text-xs">
                  <FileText className="w-3 h-3 mr-1" /> Export PDF
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {results ? (
              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="bg-transparent p-1 gap-1 rounded-xl">
                  <TabsTrigger value="overview" className="text-xs rounded-lg">Overview</TabsTrigger>
                  <TabsTrigger value="chart" className="text-xs rounded-lg">Equity Curves</TabsTrigger>
                  <TabsTrigger value="metrics" className="text-xs rounded-lg">Key Metrics</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={TrendingUp}
                      label="Media Finale"
                      value={results.avg_final_capital}
                      format="currency"
                      color="green"
                    />
                    <StatCard
                      icon={Target}
                      label="Mediana Finale"
                      value={results.median_final_capital}
                      format="currency"
                      color="primary"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Best Case"
                      value={results.max_final_capital}
                      format="currency"
                      color="green"
                      subValue="Top 1%"
                    />
                    <StatCard
                      icon={TrendingDown}
                      label="Worst Case"
                      value={results.min_final_capital}
                      format="currency"
                      color="red"
                      subValue="Bottom 1%"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={AlertTriangle}
                      label="Ruin Probability"
                      value={results.bankruptcy_rate}
                      format="percent"
                      color={results.bankruptcy_rate > 10 ? 'red' : 'green'}
                    />
                    <StatCard
                      icon={ArrowDownRight}
                      label="Max Drawdown (avg)"
                      value={results.avg_max_drawdown || 0}
                      format="percent"
                      color={results.avg_max_drawdown > 30 ? 'red' : 'yellow'}
                    />
                    <StatCard
                      icon={Gauge}
                      label="Expectancy"
                      value={metrics.expectancy}
                      color={parseFloat(metrics.expectancy) > 0 ? 'green' : 'red'}
                    />
                    <StatCard
                      icon={Percent}
                      label="Profit Factor"
                      value={metrics.profitFactor}
                      color={parseFloat(metrics.profitFactor) > 1 ? 'green' : 'red'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={Target}
                      label="Kelly Criterion"
                      value={metrics.kellyPercent}
                      format="percent"
                      color="primary"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="ROI Medio"
                      value={metrics.avgReturn}
                      format="percent"
                      color={parseFloat(metrics.avgReturn) > 0 ? 'green' : 'red'}
                    />
                  </div>
                </TabsContent>

                {/* Chart Tab */}
                <TabsContent value="chart">
                  <div className="h-80">
                    <ResponsiveContainer>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis
                          dataKey="trade"
                          stroke="#666"
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          stroke="#666"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value) => [`$${value.toLocaleString()}`, '']}
                        />
                        <ReferenceLine y={params.initial_capital} stroke="#888" strokeDasharray="5 5" />
                        {results.equity_curves?.slice(0, 30).map((_, i) => (
                          <Line
                            key={i}
                            type="monotone"
                            dataKey={`sim${i}`}
                            stroke={curveColors[i % curveColors.length]}
                            strokeWidth={1}
                            dot={false}
                            opacity={0.5}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Mostrando 30 simulazioni su 10.000 • Linea tratteggiata = capitale iniziale
                  </p>
                </TabsContent>

                {/* Metrics Tab */}
                <TabsContent value="metrics" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strategy Metrics */}
                    <div className="p-4 bg-white/5 rounded-xl space-y-3">
                      <h4 className="font-medium text-sm text-primary">Strategy Metrics</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate</span>
                          <span className="font-mono">{params.win_rate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">R:R Ratio</span>
                          <span className="font-mono">{(params.avg_win / params.avg_loss).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expectancy (R)</span>
                          <span className={cn(
                            "font-mono",
                            parseFloat(metrics.expectancy) > 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {metrics.expectancy}R
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Profit Factor</span>
                          <span className="font-mono">{metrics.profitFactor}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kelly %</span>
                          <span className="font-mono">{metrics.kellyPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Results */}
                    <div className="p-4 bg-white/5 rounded-xl space-y-3">
                      <h4 className="font-medium text-sm text-primary">Simulation Results</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Profitable %</span>
                          <span className="font-mono text-emerald-400">
                            {(100 - (results.bankruptcy_rate || 0)).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg Return</span>
                          <span className={cn(
                            "font-mono",
                            parseFloat(metrics.avgReturn) > 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {metrics.avgReturn}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Median Return</span>
                          <span className="font-mono">{metrics.medianReturn}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Drawdown (avg)</span>
                          <span className="font-mono text-red-400">
                            -{results.avg_max_drawdown?.toFixed(1) || 0}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Biggest Max DD</span>
                          <span className="font-mono text-red-400">
                            -{results.worst_drawdown?.toFixed(1) || results.avg_max_drawdown?.toFixed(1) || 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-center">
                <Dices className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Configura i parametri e lancia la simulazione
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  10.000 scenari di equity verranno calcolati
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Formula Reference */}
      <Card className="bg-white/5 border-border/50">
        <CardContent className="p-4">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            Formule di Riferimento
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Expectancy</p>
              <p>E = (WinRate × AvgWin) - (LossRate × AvgLoss)</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Profit Factor</p>
              <p>PF = (WinRate × AvgWin) / (LossRate × AvgLoss)</p>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Kelly Criterion</p>
              <p>K% = (WinRate - LossRate/RR) × 100</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
