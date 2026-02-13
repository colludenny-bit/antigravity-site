import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import {
  Brain, Shield, Target, Activity, Zap, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Lock, Unlock, ChevronRight, Clock,
  BarChart3, Flame, Eye, RefreshCw, ArrowUpRight, Info
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Phase badges with colors
const PhaseBadge = ({ phase }) => {
  const config = {
    ACQUISITION: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Acquisizione' },
    MAINTENANCE: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Mantenimento' },
    MAINTENANCE_PLUS: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Killer Mode' }
  };
  const { bg, text, label } = config[phase] || config.ACQUISITION;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${bg} ${text}`}>
      {label}
    </span>
  );
};

// Score Ring Component
const ScoreRing = ({ score, label, size = 80, color = 'primary' }) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const colors = {
    primary: 'stroke-primary',
    yellow: 'stroke-yellow-500',
    red: 'stroke-red-500',
    blue: 'stroke-blue-500',
    emerald: 'stroke-emerald-500'
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            className="text-secondary/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth="4"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className={`${colors[color]} transition-all duration-1000`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{score}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
};

// Trigger Button Component
const TriggerButton = ({ trigger, selected, onToggle }) => {
  const icons = {
    FOMO: Flame,
    REVENGE: Target,
    CHASING: TrendingUp,
    BOREDOM: Clock,
    OVERCONFIDENCE: Zap,
    FEAR: Shield,
    AVOIDANCE: Eye
  };
  const Icon = icons[trigger] || AlertTriangle;

  return (
    <button
      type="button"
      onClick={() => onToggle(trigger)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${selected
        ? 'bg-red-500/20 border border-red-500/50 text-red-400'
        : 'bg-white/5 border border-transparent hover:bg-white/5 text-muted-foreground'
        }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{trigger}</span>
    </button>
  );
};

export default function PsychologyPage() {
  const [activeTab, setActiveTab] = useState('eod');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [engineState, setEngineState] = useState({
    phase: 'ACQUISITION',
    level: 1,
    confidence_readiness: 0,
    grace_tokens: 3
  });

  // EOD Form State
  const [eodForm, setEodForm] = useState({
    stress: 5,
    focus: 5,
    energy: 5,
    physical_tension: 5,
    urge_to_trade: 5,
    dominant_state: '',
    temptation: '',
    shutdown_ritual_done: false,
    limits_respected: true,
    breaks_taken: false,
    mindful_reset_used: false,
    triggers: [],
    free_note: '',
    // Journal telemetry
    session_type: 'trade_day',
    pnl: 0,
    trades_count: 0,
    planned_trades: 0,
    unplanned_trades: 0
  });

  const toggleTrigger = useCallback((trigger) => {
    setEodForm(prev => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter(t => t !== trigger)
        : [...prev.triggers, trigger]
    }));
  }, []);

  const handleSubmitEOD = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/psychology/eod`, {
        eod_psych: {
          date: new Date().toISOString().split('T')[0],
          stress_1_10: eodForm.stress,
          focus_1_10: eodForm.focus,
          energy_1_10: eodForm.energy,
          physical_tension_1_10: eodForm.physical_tension,
          urge_to_trade_0_10: eodForm.urge_to_trade,
          dominant_state_one_word: eodForm.dominant_state,
          temptation_one_sentence: eodForm.temptation,
          behaviors: {
            shutdown_ritual_done: eodForm.shutdown_ritual_done,
            limits_respected: eodForm.limits_respected,
            breaks_taken: eodForm.breaks_taken,
            mindful_reset_used: eodForm.mindful_reset_used
          },
          triggers_selected: eodForm.triggers,
          free_note_optional: eodForm.free_note
        },
        journal_telemetry: {
          session_type: eodForm.session_type,
          pnl: eodForm.pnl,
          trades_count: eodForm.trades_count,
          planned_trades_count: eodForm.planned_trades,
          unplanned_trades_count: eodForm.unplanned_trades
        },
        engine_state: engineState
      });

      setAnalysisResult(response.data);
      setActiveTab('results');
      toast.success('Analisi EOD completata');

      // Update engine state from response
      if (response.data.data_updates) {
        setEngineState(prev => ({
          ...prev,
          grace_tokens: response.data.data_updates.grace_tokens_remaining
        }));
      }
    } catch (error) {
      console.error('EOD analysis error:', error);
      toast.error('Errore durante l\'analisi');
    } finally {
      setLoading(false);
    }
  };

  const requestPromotion = async () => {
    if (engineState.confidence_readiness < 75) {
      toast.error('Readiness insufficiente per richiedere promozione');
      return;
    }
    toast.success('Richiesta promozione inviata. Inizia la PROVE WEEK.');
  };

  return (
    <div className="space-y-6 fade-in" data-testid="psychology-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Brain className="w-7 h-7 md:w-8 md:h-8 text-primary" />
            Psychology EOD
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Shark Mind Engine - Trasforma la psicologia in sistema
          </p>
        </div>

        {/* Phase & Level Badge */}
        <div className="flex items-center gap-3">
          <PhaseBadge phase={engineState.phase} />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
            <span className="text-xs text-muted-foreground">Level</span>
            <span className="font-bold text-primary">{engineState.level}</span>
          </div>
        </div>
      </motion.div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-transparent p-1 gap-1 rounded-xl w-full md:w-auto grid grid-cols-4 md:flex">
          <TabsTrigger value="eod" className="rounded-lg data-[state=active]:bg-primary/20" data-testid="tab-eod">
            <Activity className="w-4 h-4 mr-2 hidden md:inline" />
            EOD
          </TabsTrigger>
          <TabsTrigger value="results" className="rounded-lg data-[state=active]:bg-primary/20" data-testid="tab-results">
            <BarChart3 className="w-4 h-4 mr-2 hidden md:inline" />
            Risultati
          </TabsTrigger>
          <TabsTrigger value="progress" className="rounded-lg data-[state=active]:bg-primary/20" data-testid="tab-progress">
            <TrendingUp className="w-4 h-4 mr-2 hidden md:inline" />
            Progresso
          </TabsTrigger>
          <TabsTrigger value="protocol" className="rounded-lg data-[state=active]:bg-primary/20" data-testid="tab-protocol">
            <Shield className="w-4 h-4 mr-2 hidden md:inline" />
            Protocollo
          </TabsTrigger>
        </TabsList>

        {/* EOD Form Tab */}
        <TabsContent value="eod" className="space-y-6">
          <form onSubmit={handleSubmitEOD} className="space-y-6">
            {/* Emotional Metrics Grid */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Stato Psico-Fisico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Stress */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Stress</Label>
                      <span className={`font-bold ${eodForm.stress > 7 ? 'text-red-400' : eodForm.stress < 4 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        {eodForm.stress}/10
                      </span>
                    </div>
                    <Slider
                      value={[eodForm.stress]}
                      onValueChange={([v]) => setEodForm({ ...eodForm, stress: v })}
                      max={10}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                  </div>

                  {/* Focus */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Focus</Label>
                      <span className={`font-bold ${eodForm.focus > 7 ? 'text-emerald-400' : eodForm.focus < 4 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {eodForm.focus}/10
                      </span>
                    </div>
                    <Slider
                      value={[eodForm.focus]}
                      onValueChange={([v]) => setEodForm({ ...eodForm, focus: v })}
                      max={10}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                  </div>

                  {/* Energy */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Energia</Label>
                      <span className={`font-bold ${eodForm.energy > 7 ? 'text-emerald-400' : eodForm.energy < 4 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {eodForm.energy}/10
                      </span>
                    </div>
                    <Slider
                      value={[eodForm.energy]}
                      onValueChange={([v]) => setEodForm({ ...eodForm, energy: v })}
                      max={10}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                  </div>

                  {/* Physical Tension */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">Tensione Fisica</Label>
                      <span className={`font-bold ${eodForm.physical_tension > 7 ? 'text-red-400' : eodForm.physical_tension < 4 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        {eodForm.physical_tension}/10
                      </span>
                    </div>
                    <Slider
                      value={[eodForm.physical_tension]}
                      onValueChange={([v]) => setEodForm({ ...eodForm, physical_tension: v })}
                      max={10}
                      min={1}
                      step={1}
                      className="py-2"
                    />
                  </div>
                </div>

                {/* Urge to Trade - Full Width */}
                <div className="space-y-3 p-4 bg-white/5 rounded-xl">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm flex items-center gap-2">
                      <Flame className="w-4 h-4 text-orange-400" />
                      Urge to Trade
                    </Label>
                    <span className={`font-bold ${eodForm.urge_to_trade > 7 ? 'text-red-400' : eodForm.urge_to_trade < 4 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {eodForm.urge_to_trade}/10
                    </span>
                  </div>
                  <Slider
                    value={[eodForm.urge_to_trade]}
                    onValueChange={([v]) => setEodForm({ ...eodForm, urge_to_trade: v })}
                    max={10}
                    min={0}
                    step={1}
                    className="py-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Behaviors & Triggers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Behaviors */}
              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    Comportamenti
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'shutdown_ritual_done', label: 'Shutdown Ritual Completato', icon: Lock },
                    { key: 'limits_respected', label: 'Limiti Rispettati', icon: Shield },
                    { key: 'breaks_taken', label: 'Pause Effettuate', icon: Clock },
                    { key: 'mindful_reset_used', label: 'Reset Mindful Usato', icon: RefreshCw }
                  ].map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{label}</span>
                      </div>
                      <Switch
                        checked={eodForm[key]}
                        onCheckedChange={(checked) => setEodForm({ ...eodForm, [key]: checked })}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Triggers */}
              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Trigger Attivi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {['FOMO', 'REVENGE', 'CHASING', 'BOREDOM', 'OVERCONFIDENCE', 'FEAR', 'AVOIDANCE'].map(trigger => (
                      <TriggerButton
                        key={trigger}
                        trigger={trigger}
                        selected={eodForm.triggers.includes(trigger)}
                        onToggle={toggleTrigger}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Session Info */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  Telemetria Sessione
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Tipo Sessione</Label>
                    <select
                      value={eodForm.session_type}
                      onChange={(e) => setEodForm({ ...eodForm, session_type: e.target.value })}
                      className="w-full bg-white/5 border-0 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="trade_day">Trade Day</option>
                      <option value="no_trade_day">No Trade Day</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">P&L</Label>
                    <input
                      type="number"
                      value={eodForm.pnl}
                      onChange={(e) => setEodForm({ ...eodForm, pnl: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-white/5 border-0 rounded-lg px-3 py-2 text-sm"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Trade Pianificati</Label>
                    <input
                      type="number"
                      value={eodForm.planned_trades}
                      onChange={(e) => setEodForm({ ...eodForm, planned_trades: parseInt(e.target.value) || 0 })}
                      className="w-full bg-white/5 border-0 rounded-lg px-3 py-2 text-sm"
                      min="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Trade Non Pianificati</Label>
                    <input
                      type="number"
                      value={eodForm.unplanned_trades}
                      onChange={(e) => setEodForm({ ...eodForm, unplanned_trades: parseInt(e.target.value) || 0 })}
                      className="w-full bg-white/5 border-0 rounded-lg px-3 py-2 text-sm"
                      min="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Free Note */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Note Libere</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={eodForm.free_note}
                  onChange={(e) => setEodForm({ ...eodForm, free_note: e.target.value })}
                  placeholder="Cosa ha influenzato la tua giornata? Qualcosa da segnalare?"
                  className="bg-white/5 border-0 min-h-[100px] resize-none"
                />
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90"
              data-testid="submit-eod"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analisi in corso...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Analizza EOD
                </div>
              )}
            </Button>
          </form>
        </TabsContent>

        {/* Results Tab */}
        <TabsContent value="results" className="space-y-6">
          <AnimatePresence mode="wait">
            {analysisResult ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Shark Score Header */}
                <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <ScoreRing
                          score={analysisResult.scores?.shark_score_0_100 || 0}
                          label="Shark Score"
                          size={100}
                          color="primary"
                        />
                        <div>
                          <h2 className="text-xl font-bold">Analisi Completata</h2>
                          <p className="text-muted-foreground text-sm">{analysisResult.date}</p>
                          <PhaseBadge phase={analysisResult.phase} />
                        </div>
                      </div>

                      {/* Sub-scores */}
                      <div className="flex items-center gap-4">
                        <ScoreRing
                          score={analysisResult.scores?.discipline_0_100 || 0}
                          label="Disciplina"
                          size={70}
                          color="blue"
                        />
                        <ScoreRing
                          score={analysisResult.scores?.clarity_0_100 || 0}
                          label="Chiarezza"
                          size={70}
                          color="emerald"
                        />
                        <ScoreRing
                          score={analysisResult.scores?.emotional_stability_0_100 || 0}
                          label="Stabilità"
                          size={70}
                          color="yellow"
                        />
                        <ScoreRing
                          score={100 - (analysisResult.scores?.compulsion_risk_0_100 || 0)}
                          label="Controllo"
                          size={70}
                          color={analysisResult.scores?.compulsion_risk_0_100 > 50 ? 'red' : 'emerald'}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Key Insights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* One Key Cause */}
                  <Card className="bg-card/60 backdrop-blur border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm mb-1">Causa Principale</h3>
                          <p className="text-sm text-muted-foreground">{analysisResult.one_key_cause}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* One Thing Done Well */}
                  <Card className="bg-card/60 backdrop-blur border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm mb-1">Fatto Bene</h3>
                          <p className="text-sm text-muted-foreground">{analysisResult.one_thing_done_well}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tomorrow Protocol */}
                {analysisResult.tomorrow_protocol && (
                  <Card className="bg-card/60 backdrop-blur border-amber-500/30 border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="w-5 h-5 text-amber-400" />
                        Protocollo Domani
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${analysisResult.tomorrow_protocol.mode === 'TILT_LOCK' ? 'bg-red-500/20 text-red-400' :
                          analysisResult.tomorrow_protocol.mode === 'A_PLUS_ONLY' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                          {analysisResult.tomorrow_protocol.mode}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Micro Rule */}
                      <div className="p-4 bg-primary/10 rounded-xl border border-primary/30">
                        <p className="font-mono text-sm">{analysisResult.tomorrow_protocol.micro_rule_if_then}</p>
                      </div>

                      {/* Constraints */}
                      {analysisResult.tomorrow_protocol.constraints && (
                        <div className="flex flex-wrap gap-3">
                          {analysisResult.tomorrow_protocol.constraints.max_trades !== undefined && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
                              <Lock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">Max {analysisResult.tomorrow_protocol.constraints.max_trades} trade</span>
                            </div>
                          )}
                          {analysisResult.tomorrow_protocol.constraints.timebox_minutes > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">Timebox {analysisResult.tomorrow_protocol.constraints.timebox_minutes}min</span>
                            </div>
                          )}
                          {analysisResult.tomorrow_protocol.constraints.allowed_setups?.includes('A_PLUS_ONLY') && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 rounded-lg">
                              <Zap className="w-4 h-4 text-amber-400" />
                              <span className="text-sm text-amber-400">Solo Setup A+</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reset Steps */}
                      {analysisResult.tomorrow_protocol.reset_steps?.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Reset Steps</h4>
                          <div className="space-y-1">
                            {analysisResult.tomorrow_protocol.reset_steps.map((step, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <ChevronRight className="w-4 h-4 text-primary" />
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Readiness Message */}
                {analysisResult.readiness && (
                  <Card className="bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                          <ArrowUpRight className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">Messaggio Coach</h3>
                            <span className="text-sm text-muted-foreground">
                              Readiness: {analysisResult.readiness.confidence_readiness_0_100}%
                            </span>
                          </div>
                          <p className="text-sm">{analysisResult.readiness.message_to_trader}</p>

                          {analysisResult.readiness.promotion?.suggested && (
                            <div className="mt-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                              <p className="text-sm text-emerald-400 font-medium">
                                Promozione Suggerita a {analysisResult.readiness.promotion.next_phase}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detected Patterns */}
                {analysisResult.detected_patterns?.length > 0 && (
                  <Card className="bg-card/60 backdrop-blur border-border/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Eye className="w-5 h-5 text-purple-400" />
                        Pattern Rilevati
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analysisResult.detected_patterns.map((pattern, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border ${pattern.severity === 'high' ? 'bg-red-500/10 border-red-500/30' :
                              pattern.severity === 'medium' ? 'bg-amber-500/10 border-amber-500/30' :
                                'bg-white/5 border-border/50'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm">{pattern.pattern_id.replace('_', ' ')}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${pattern.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                                pattern.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-white/5 text-muted-foreground'
                                }`}>
                                {pattern.severity}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {pattern.evidence?.map((ev, j) => (
                                <span key={j} className="text-xs px-2 py-0.5 bg-white/5 rounded">
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            ) : (
              <Card className="bg-card/60 backdrop-blur border-border/50">
                <CardContent className="p-12 text-center">
                  <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="text-lg font-medium mb-2">Nessuna Analisi</h3>
                  <p className="text-muted-foreground text-sm">
                    Completa il form EOD per ricevere l'analisi Shark Mind
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setActiveTab('eod')}
                  >
                    Vai al Form EOD
                  </Button>
                </CardContent>
              </Card>
            )}
          </AnimatePresence>
        </TabsContent>

        {/* Progress Tab */}
        <TabsContent value="progress" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current Phase */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">Fase Attuale</h3>
                <PhaseBadge phase={engineState.phase} />
                <p className="text-sm text-muted-foreground mt-2">
                  {engineState.phase === 'ACQUISITION' ? 'Costruisci abitudini' :
                    engineState.phase === 'MAINTENANCE' ? 'Proteggi il capitale' :
                      'Massima performance'}
                </p>
              </CardContent>
            </Card>

            {/* Readiness */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardContent className="p-6 text-center">
                <ScoreRing
                  score={engineState.confidence_readiness}
                  label=""
                  size={80}
                  color={engineState.confidence_readiness >= 75 ? 'emerald' : 'yellow'}
                />
                <h3 className="font-semibold mt-4 mb-1">Confidence Readiness</h3>
                <p className="text-sm text-muted-foreground">
                  {engineState.confidence_readiness >= 75 ? 'Pronto per promozione' : 'Continua a costruire'}
                </p>
              </CardContent>
            </Card>

            {/* Grace Tokens */}
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardContent className="p-6 text-center">
                <div className="flex justify-center gap-2 mb-4">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${i < engineState.grace_tokens
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-white/5 text-muted-foreground'
                        }`}
                    >
                      {i < engineState.grace_tokens ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </div>
                  ))}
                </div>
                <h3 className="font-semibold mb-1">Grace Tokens</h3>
                <p className="text-sm text-muted-foreground">
                  {engineState.grace_tokens} token rimanenti
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Promotion Request */}
          {engineState.phase !== 'MAINTENANCE_PLUS' && (
            <Card className="bg-card/60 backdrop-blur border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold mb-1">Richiedi Promozione</h3>
                    <p className="text-sm text-muted-foreground">
                      {engineState.confidence_readiness >= 75
                        ? 'Sei pronto per avanzare al livello successivo'
                        : `Raggiungi ${75}% readiness per sbloccare (attuale: ${engineState.confidence_readiness}%)`}
                    </p>
                  </div>
                  <Button
                    onClick={requestPromotion}
                    disabled={engineState.confidence_readiness < 75}
                    className="shrink-0"
                  >
                    <ArrowUpRight className="w-4 h-4 mr-2" />
                    Richiedi
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase Progression Info */}
          <Card className="bg-card/60 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-400" />
                Progressione Fasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { phase: 'ACQUISITION', desc: 'Permissivo. Costruisci abitudini con grace token attivi. Penalità soft.' },
                  { phase: 'MAINTENANCE', desc: 'Severo. Proteggi il capitale psicologico. Penalità dure su errori critici.' },
                  { phase: 'MAINTENANCE_PLUS', desc: 'Killer Mode. Standard massimi. Controllo totale prima di operare.' }
                ].map(({ phase, desc }, i) => (
                  <div
                    key={phase}
                    className={`p-4 rounded-xl border ${engineState.phase === phase
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-secondary/20 border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${engineState.phase === phase ? 'bg-primary text-white' : 'bg-white/5'
                        }`}>
                        {i + 1}
                      </span>
                      <PhaseBadge phase={phase} />
                    </div>
                    <p className="text-sm text-muted-foreground ml-9">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Protocol Tab */}
        <TabsContent value="protocol" className="space-y-6">
          <Card className="bg-card/60 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Guardrails & Lock
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tilt Lock */}
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                <div className="flex items-center gap-3 mb-2">
                  <Lock className="w-5 h-5 text-red-400" />
                  <h4 className="font-semibold">Tilt Lock</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Attivato quando: REVENGE/CHASING + limits_broken OPPURE overtrading + drawdown alto + stress alto
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-red-500/20 rounded">A+ Only</span>
                  <span className="text-xs px-2 py-1 bg-red-500/20 rounded">Max 2 Trade</span>
                  <span className="text-xs px-2 py-1 bg-red-500/20 rounded">Reset dopo 1 Loss</span>
                </div>
              </div>

              {/* Overtrading Lock */}
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <h4 className="font-semibold">Overtrading Lock</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Attivato quando: trade non pianificati &gt; 0 + urge alta OPPURE overtrading_detected
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 bg-amber-500/20 rounded">Max 2 Trade</span>
                  <span className="text-xs px-2 py-1 bg-amber-500/20 rounded">1 Finestra Oraria</span>
                  <span className="text-xs px-2 py-1 bg-amber-500/20 rounded">1 Setup Only</span>
                </div>
              </div>

              {/* Normal Mode */}
              <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                <div className="flex items-center gap-3 mb-2">
                  <Unlock className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-semibold">Normal Mode</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Modalità standard. Nessun constraint aggiuntivo. Segui la micro-regola giornaliera.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Scoring Principles */}
          <Card className="bg-card/60 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Principi di Scoring
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <h5 className="font-medium mb-1">Process &gt; Outcome</h5>
                  <p className="text-xs text-muted-foreground">
                    Valuta disciplina, limiti, qualità decisionale. NON il P&L.
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <h5 className="font-medium mb-1">1 Leva Sola</h5>
                  <p className="text-xs text-muted-foreground">
                    Una micro-regola operativa per domani. Testabile, piccola, specifica.
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <h5 className="font-medium mb-1">Progressione Auto-guidata</h5>
                  <p className="text-xs text-muted-foreground">
                    Da permissivo a severo quando la stabilità è reale.
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <h5 className="font-medium mb-1">Anti-Tilt & Overtrading</h5>
                  <p className="text-xs text-muted-foreground">
                    Priorità: ridurre superficie di errore domani.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
