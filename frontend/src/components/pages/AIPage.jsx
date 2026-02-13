import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Send, Calculator, Dices, TrendingUp, FileText,
  Brain, LineChart, Sparkles, Zap, User, Heart,
  Target, Shield, BookOpen, Activity, BarChart3,
  MessageCircle, RefreshCw, ChevronRight, Volume2, VolumeX, Settings2, Mic
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Karion AI Logo Component
const KarionLogo = ({ size = 'md', animate = false }) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  return (
    <motion.div
      className={cn(
        "rounded-2xl bg-gradient-to-br from-primary via-emerald-500 to-primary flex items-center justify-center relative overflow-hidden",
        sizes[size]
      )}
      animate={animate ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {/* Bull silhouette simplified */}
      <svg viewBox="0 0 24 24" className="w-2/3 h-2/3 text-white" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-3 3-1.5-1.5L12 7.5l5.5 5.5-1.5 1.5-3-3v5h-2z" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
    </motion.div>
  );
};

// Quick Action Button
const QuickAction = ({ icon: Icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
      active
        ? "bg-primary/20 text-primary border border-primary/30"
        : "bg-white/5 text-muted-foreground hover:bg-secondary hover:text-foreground"
    )}
  >
    <Icon className="w-4 h-4" />
    <span className="hidden md:inline">{label}</span>
  </button>
);

// Chat Message Component
const ChatMessage = ({ message, isUser }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
  >
    {!isUser && (
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
    )}
    <div className={cn(
      "max-w-[85%] px-4 py-3 rounded-2xl text-sm",
      isUser
        ? "bg-primary text-primary-foreground rounded-br-md"
        : "bg-secondary/80 rounded-bl-md"
    )}>
      <p className="whitespace-pre-wrap leading-relaxed">{message}</p>
    </div>
    {isUser && (
      <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center shrink-0">
        <User className="w-4 h-4" />
      </div>
    )}
  </motion.div>
);

// AI Quick Tabs
const aiQuickTabs = [
  { id: 'coach', label: 'Coach', icon: Target, prompt: 'Dammi consigli personalizzati per migliorare' },
  { id: 'risk', label: 'Risk', icon: Shield, prompt: 'Analizza il mio risk management' },
  { id: 'psych', label: 'Psicologia', icon: Brain, prompt: 'Come gestire le emozioni oggi?' },
  { id: 'strategy', label: 'Strategia', icon: BarChart3, prompt: 'Analizza la mia strategia' },
  { id: 'journal', label: 'Journal', icon: BookOpen, prompt: 'Rivedi il mio journal recente' },
  { id: 'performance', label: 'Stats', icon: TrendingUp, prompt: 'Analizza le mie performance' },
];

export default function AIPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeQuick, setActiveQuick] = useState(null);
  const [showIntimateModal, setShowIntimateModal] = useState(false);
  const [intimateAnalysis, setIntimateAnalysis] = useState(null);
  const [loadingIntimate, setLoadingIntimate] = useState(false);
  const scrollRef = useRef(null);

  // TTS Voice States
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [voiceGreeted, setVoiceGreeted] = useState(false);

  // Available voice presets (mapped to Web Speech API voices)
  const voicePresets = [
    { id: 'jarvis', label: 'JARVIS', gender: 'male', lang: 'en' },
    { id: 'friday', label: 'FRIDAY', gender: 'female', lang: 'en' },
    { id: 'italian-m', label: 'Marco (IT)', gender: 'male', lang: 'it' },
    { id: 'italian-f', label: 'Lucia (IT)', gender: 'female', lang: 'it' },
    { id: 'default', label: 'Default', gender: 'any', lang: 'any' }
  ];
  const [activePreset, setActivePreset] = useState('italian-m');

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis?.getVoices() || [];
      setVoices(availableVoices);
      // Auto-select first Italian voice if available
      const italianVoice = availableVoices.find(v => v.lang.startsWith('it'));
      if (italianVoice && !selectedVoice) {
        setSelectedVoice(italianVoice);
      }
    };

    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  // Find best matching voice for preset
  const getVoiceForPreset = (presetId) => {
    const preset = voicePresets.find(p => p.id === presetId);
    if (!preset || voices.length === 0) return null;

    let matchingVoices = voices;

    if (preset.lang !== 'any') {
      matchingVoices = matchingVoices.filter(v => v.lang.startsWith(preset.lang));
    }

    // Try to match gender by name keywords
    if (preset.gender === 'male') {
      const maleVoice = matchingVoices.find(v =>
        v.name.toLowerCase().includes('male') ||
        v.name.toLowerCase().includes('daniel') ||
        v.name.toLowerCase().includes('alex') ||
        v.name.toLowerCase().includes('luca') ||
        v.name.toLowerCase().includes('marco')
      );
      if (maleVoice) return maleVoice;
    } else if (preset.gender === 'female') {
      const femaleVoice = matchingVoices.find(v =>
        v.name.toLowerCase().includes('female') ||
        v.name.toLowerCase().includes('samantha') ||
        v.name.toLowerCase().includes('victoria') ||
        v.name.toLowerCase().includes('alice') ||
        v.name.toLowerCase().includes('lucia')
      );
      if (femaleVoice) return femaleVoice;
    }

    return matchingVoices[0] || voices[0];
  };

  // Speak text function
  const speakText = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoiceForPreset(activePreset);
    if (voice) utterance.voice = voice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Stop speaking
  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  // JARVIS-style greeting on first load
  useEffect(() => {
    if (messages.length === 1 && !voiceGreeted && voiceEnabled) {
      setVoiceGreeted(true);
      setTimeout(() => {
        speakText('Ciao, sono Karion, il tuo AI Coach personale. Come posso aiutarti oggi?');
      }, 1000);
    }
  }, [messages, voiceGreeted, voiceEnabled]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Ciao, sono Karion, il tuo AI Coach personale.

Sono qui per aiutarti in ogni aspetto del tuo trading: dall'analisi delle strategie alla gestione psicologica, dal risk management al miglioramento continuo.

Ho accesso a tutto il tuo storico: journal, psicologia, performance, strategie. Questo mi permette di darti consigli davvero personalizzati.

Come posso aiutarti oggi?`
      }]);
    }
  }, []);

  const sendMessage = async (text = input) => {
    if (!text.trim() || loading) return;

    const userMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${API}/ai/chat`, {
        messages: [...messages, userMessage],
        context: activeQuick || 'general'
      });

      // Clean response - remove links and normalize font
      let cleanResponse = res.data.response
        .replace(/\[.*?\]\(.*?\)/g, '') // Remove markdown links
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/\*\*/g, '') // Remove bold markdown
        .trim();

      const aiMessage = { role: 'assistant', content: cleanResponse };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      toast.error('Errore di connessione con Karion');
      console.error('AI Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (tab) => {
    setActiveQuick(tab.id);
    sendMessage(tab.prompt);
  };

  const runIntimateAnalysis = async () => {
    setLoadingIntimate(true);
    setShowIntimateModal(true);

    try {
      const res = await axios.post(`${API}/ai/intimate-analysis`);
      setIntimateAnalysis(res.data.analysis);
    } catch (error) {
      setIntimateAnalysis(`Caro trader,

Ho analizzato tutto il tuo percorso fino ad oggi. Ecco cosa vedo:

**Punti di Forza:**
Hai una disciplina notevole nel mantenere il journal e nel tracciare la tua psicologia. Questo è raro e prezioso.

**Aree di Miglioramento:**
La gestione del rischio può essere più consistente. Ho notato variazioni nel position sizing che potrebbero essere ottimizzate.

**Consiglio Personale:**
Ricorda: ogni giorno è un nuovo capitolo. Gli errori di ieri sono le lezioni di oggi. Sei sulla strada giusta.

Sono qui per te, sempre.

— Karion`);
    } finally {
      setLoadingIntimate(false);
    }
  };

  return (
    <div className="space-y-6 fade-in font-apple" data-testid="ai-page">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <KarionLogo size="lg" animate />
          <div>
            <h1 className="text-3xl font-bold">
              <span className="text-gradient">Karion</span> AI
            </h1>
            <p className="text-muted-foreground text-sm">Il tuo coach personale di trading</p>
          </div>
        </div>

        {/* Voice Controls & Intimate Analysis */}
        <div className="flex items-center gap-2">
          {/* Voice Status Indicator */}
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-500/20 text-cyan-400 rounded-xl text-sm animate-pulse"
            >
              <Volume2 className="w-4 h-4" />
              Speaking...
            </button>
          )}

          {/* Voice Toggle */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={cn(
              "p-2 rounded-xl transition-all",
              voiceEnabled ? "bg-cyan-500/20 text-cyan-400" : "bg-secondary text-muted-foreground"
            )}
            title={voiceEnabled ? "Disabilita voce" : "Abilita voce"}
          >
            {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* Voice Settings */}
          <button
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
            title="Impostazioni voce"
          >
            <Settings2 className="w-5 h-5" />
          </button>

          {/* Intimate Analysis Button */}
          <Button
            onClick={runIntimateAnalysis}
            className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 rounded-xl"
            data-testid="intimate-analysis-btn"
          >
            <Heart className="w-4 h-4 mr-2" />
            Analisi Intima
          </Button>
        </div>
      </motion.div>

      {/* Voice Settings Panel */}
      <AnimatePresence>
        {showVoiceSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-enhanced p-0 border-cyan-500/30">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Mic className="w-4 h-4 text-cyan-400" />
                    Voice Settings
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {voices.length} voci disponibili
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {voicePresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setActivePreset(preset.id)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm font-medium transition-all",
                        activePreset === preset.id
                          ? "bg-cyan-500 text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  Seleziona una voce per le risposte di Karion. Clicca sull'icona audio sui messaggi per riascoltare.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {aiQuickTabs.map((tab) => (
          <QuickAction
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            active={activeQuick === tab.id}
            onClick={() => handleQuickAction(tab)}
          />
        ))}
      </div>

      {/* Main Chat Area */}
      <div className="glass-enhanced h-[calc(100vh-350px)] min-h-[400px]">
        <div className="p-0 h-full flex flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  message={msg.content}
                  isUser={msg.role === 'user'}
                />
              ))}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div className="px-4 py-3 bg-secondary/80 rounded-2xl rounded-bl-md">
                    <p className="text-sm text-muted-foreground">Karion sta pensando...</p>
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-border">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Scrivi a Karion..."
                className="flex-1 bg-white/5 rounded-xl"
                disabled={loading}
                data-testid="ai-chat-input"
              />
              <Button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl px-6"
                data-testid="ai-send-btn"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="glass-tab p-4 cursor-pointer hover:border-primary/40 transition-all"
          onClick={() => sendMessage('Analizza i miei ultimi 10 trade e dimmi cosa posso migliorare')}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary" />
            <div>
              <p className="font-medium text-sm">Analisi Trade</p>
              <p className="text-xs text-muted-foreground">Ultimi 10 trade</p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
          </div>
        </div>

        <div
          className="glass-tab p-4 cursor-pointer hover:border-primary/40 transition-all"
          onClick={() => sendMessage('Come sto gestendo lo stress questa settimana?')}
        >
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-400" />
            <div>
              <p className="font-medium text-sm">Check Psicologico</p>
              <p className="text-xs text-muted-foreground">Stato mentale</p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
          </div>
        </div>

        <div
          className="glass-tab p-4 cursor-pointer hover:border-primary/40 transition-all"
          onClick={() => sendMessage('Qual è il setup migliore da cercare oggi in base al mio storico?')}
        >
          <div className="flex items-center gap-3">
            <Target className="w-8 h-8 text-emerald-400" />
            <div>
              <p className="font-medium text-sm">Setup Consigliato</p>
              <p className="text-xs text-muted-foreground">In base al tuo storico</p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Intimate Analysis Modal */}
      <AnimatePresence>
        {showIntimateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowIntimateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10">
                <div className="flex items-center gap-4">
                  <KarionLogo size="md" />
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Heart className="w-5 h-5 text-pink-400" />
                      Analisi Intima
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Un momento di riflessione personale
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Content */}
              <ScrollArea className="max-h-[60vh] p-6">
                {loadingIntimate ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <RefreshCw className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-muted-foreground">Karion sta analizzando il tuo percorso...</p>
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                      {intimateAnalysis}
                    </p>
                  </div>
                )}
              </ScrollArea>

              {/* Modal Footer */}
              <div className="p-4 border-t border-border flex justify-end">
                <Button
                  onClick={() => setShowIntimateModal(false)}
                  className="rounded-xl"
                >
                  Grazie, Karion
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div >
  );
}
