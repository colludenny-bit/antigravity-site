import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X, Mic, MicOff, Volume2, Send, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

// Page-specific help content
const pageHelp = {
    '/': {
        title: 'Dashboard',
        description: 'La tua panoramica completa del trading. Vedi le metriche principali, i trade recenti e lo stato del mercato.',
        tips: ['Controlla il tuo P&L giornaliero', 'Monitora lo stato psicologico', 'Vedi gli eventi macro in arrivo']
    },
    '/journal': {
        title: 'Trading Journal',
        description: 'Registra i tuoi trade e le tue emozioni. Karion AI analizza i pattern per migliorare le tue performance.',
        tips: ['Registra ogni trade con screenshot', 'Annota le emozioni pre/post trade', 'Usa i tag per categorizzare']
    },
    '/psychology': {
        title: 'Psychology Tracker',
        description: 'Monitora il tuo stato mentale e psicologico. Il sistema Three Strikes protegge dal revenge trading.',
        tips: ['Fai il check-in giornaliero', 'Monitora i trigger emotivi', 'Segui le raccomandazioni AI']
    },
    '/ai': {
        title: 'Karion AI',
        description: 'Il tuo coach personale di trading. Fai domande, ricevi analisi, ottieni consigli personalizzati.',
        tips: ['Usa i Quick Tabs per domande rapide', 'Attiva la voce per risposte parlate', 'Chiedi analisi del tuo journal']
    },
    '/crypto': {
        title: 'Crypto Analysis',
        description: 'Bias Engine per analisi crypto avanzata. LOWLE Strategy per segnali long-only basati su whale activity.',
        tips: ['Controlla il bias di ogni crypto', 'Attiva LOWLE in WATCH mode prima', 'Monitora i movimenti whale']
    },
    '/risk': {
        title: 'Risk Assessment',
        description: 'Valutazione del rischio AI-powered. VIX, eventi macro, e asset risk in tempo reale.',
        tips: ['Riduci size quando risk > 60', 'Evita trade prima di eventi HIGH', 'Usa gli expected move per stop']
    },
    '/performance': {
        title: 'Performance Analytics',
        description: 'Analytics quantitative avanzate. Data Quality, Strategy Leaderboard, e Optimization Moves.',
        tips: ['Scala le strategie che funzionano', 'Pausa quelle con drawdown alto', 'Segui i Next Moves suggeriti']
    },
    '/montecarlo': {
        title: 'Monte Carlo Simulation',
        description: 'Simula 10.000 scenari basati sui tuoi parametri. Calcola probabilità di rovina e Kelly Criterion.',
        tips: ['Usa Half-Kelly per sicurezza', 'Esporta PDF per documentare', 'Testa diversi parametri']
    },
    '/strategy': {
        title: 'Trading Strategies',
        description: '7 strategie complete con setup, entry/exit, e alerts. Attiva quelle che si adattano al tuo stile.',
        tips: ['Inizia con 1-2 strategie', 'Traccia ogni setup nel journal', 'Imposta alerts per segnali']
    },
    '/community': {
        title: 'Community',
        description: 'Condividi i tuoi successi con altri trader. Canali per strategia, stories dei win, chat real-time.',
        tips: ['Condividi solo trades vincenti', 'Interagisci nei canali tematici', 'Segui i top performer']
    },
    '/settings': {
        title: 'Settings',
        description: 'Configura il tuo account, integrazioni, notifiche e privacy.',
        tips: ['Collega TradingView per sync', 'Configura API keys', 'Imposta notifiche utili']
    }
};

export const AIHelperButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [question, setQuestion] = useState('');
    const [response, setResponse] = useState('');
    const location = useLocation();

    const currentHelp = pageHelp[location.pathname] || {
        title: 'Karion Help',
        description: 'Questa pagina ti aiuta a utilizzare al meglio Karion Trading OS.',
        tips: ['Esplora tutte le funzionalità', 'Usa la AI per domande', 'Leggi i tips in ogni pagina']
    };

    const handleAsk = () => {
        if (!question.trim()) return;
        setResponse('Sto elaborando la tua domanda...');
        setTimeout(() => {
            setResponse(`Per "${question}": ${currentHelp.description} Ti consiglio di ${currentHelp.tips[0].toLowerCase()}.`);
        }, 1000);
    };

    const toggleListening = () => {
        if (!isListening) {
            // Start Speech Recognition
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.lang = 'it-IT';
                recognition.continuous = false;
                recognition.interimResults = false;

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    setQuestion(transcript);
                    setIsListening(false);
                };

                recognition.onerror = () => {
                    setIsListening(false);
                };

                recognition.onend = () => {
                    setIsListening(false);
                };

                recognition.start();
                setIsListening(true);

                // Auto-stop after 10 seconds
                setTimeout(() => {
                    recognition.stop();
                }, 10000);
            }
        } else {
            setIsListening(false);
        }
    };

    return (
        <>
            {/* Floating Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "fixed bottom-24 lg:bottom-8 right-4 lg:right-8 z-50",
                    "w-12 h-12 rounded-full",
                    "bg-gradient-to-br from-primary to-emerald-400",
                    "flex items-center justify-center",
                    "shadow-lg shadow-primary/30",
                    "hover:scale-110 transition-transform"
                )}
                whileHover={{ rotate: 15 }}
                whileTap={{ scale: 0.9 }}
                data-testid="ai-helper-btn"
            >
                <HelpCircle className="w-6 h-6 text-white" />
            </motion.button>

            {/* Help Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 100 }}
                        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-24 z-50 w-80 max-h-[70vh] overflow-hidden"
                    >
                        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-primary/20 to-emerald-500/20 p-4 border-b border-border">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-primary" />
                                        <h3 className="font-bold">Karion Help</h3>
                                    </div>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-1 hover:bg-secondary rounded-lg"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
                                {/* Page Info */}
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-primary">{currentHelp.title}</h4>
                                    <p className="text-sm text-muted-foreground">{currentHelp.description}</p>
                                </div>

                                {/* Tips */}
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">TIPS:</p>
                                    {currentHelp.tips.map((tip, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm">
                                            <span className="text-primary">•</span>
                                            <span>{tip}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Response */}
                                {response && (
                                    <div className="p-3 bg-primary/10 rounded-lg text-sm">
                                        <p>{response}</p>
                                    </div>
                                )}
                            </div>

                            {/* Input */}
                            <div className="p-3 border-t border-border bg-secondary/30">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleListening}
                                        className={cn(
                                            "p-2 rounded-lg transition-all",
                                            isListening
                                                ? "bg-red-500/20 text-red-400 animate-pulse"
                                                : "bg-secondary hover:bg-secondary/80"
                                        )}
                                    >
                                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                    </button>
                                    <input
                                        type="text"
                                        value={question}
                                        onChange={(e) => setQuestion(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAsk()}
                                        placeholder="Chiedi qualcosa..."
                                        className="flex-1 bg-transparent text-sm outline-none"
                                    />
                                    <button
                                        onClick={handleAsk}
                                        className="p-2 rounded-lg bg-primary hover:bg-primary/80"
                                    >
                                        <Send className="w-4 h-4 text-white" />
                                    </button>
                                </div>
                                {isListening && (
                                    <p className="text-xs text-center text-red-400 mt-2 animate-pulse">
                                        🎤 In ascolto... (10 sec)
                                    </p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AIHelperButton;
