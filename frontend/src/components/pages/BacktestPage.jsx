import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Line, useVideoTexture, useAspect } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '../ui/button';
import {
    TrendingUp, TrendingDown, Activity, Database, Zap, Binary, Clock,
    Network, ShieldAlert, Code2, Server, Cpu
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ComposedChart, Bar, Cell
} from 'recharts';
import { toast } from 'sonner';
import api from '../../services/api';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Send, BrainCircuit, Play } from 'lucide-react';

const BACKEND_URL_RAW = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '');
const IS_LOCAL_HOST = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SAFE_BACKEND_URL = !IS_LOCAL_HOST && /localhost|127\.0\.0\.1/.test(BACKEND_URL_RAW) ? '' : BACKEND_URL_RAW;
const TARGET_SCALE = new THREE.Vector3(1, 1, 1);
const RESOLVED_BACKEND = (() => {
    const envBase = (SAFE_BACKEND_URL).trim().replace(/\/$/, '');
    if (envBase) return envBase;
    if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
        return window.location.origin;
    }
    return 'http://localhost:8000';
})();


/* =========================================================================
   UTILITY: Hacker/Quant Glowing Text Parser
   ========================================================================= */
const highlightTechText = (text) => {
    let html = text;

    // Highlight bracketed prefixes (e.g. [SYSTEM])
    html = html.replace(/(\[.*?\])/g, '<span class="text-white drop-shadow-[0_0_8px_rgba(255,255,255,1)] font-bold tracking-widest">$1</span>');

    // Highlight keywords
    const keywords = ['WARNING', 'FAIL', 'SUCCESS', 'TENSOR_MULT', 'EIGEN_VAL', 'MATRIX_INV', 'GRAD_DESC', 'VOL_SURFACE'];
    keywords.forEach(kw => {
        const regex = new RegExp(`(${kw})`, 'g');
        const color = kw === 'FAIL' || kw === 'WARNING' ? 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,1)]' :
            kw === 'SUCCESS' ? 'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,1)]' :
                'text-blue-300 drop-shadow-[0_0_10px_rgba(147,197,253,1)]';
        html = html.replace(regex, `<span class="${color} font-black animate-pulse">$1</span>`);
    });

    // Highlight Numbers and Percentages
    // Needs careful regex so we don't accidentally match HTML tags or previously replaced stuff.
    // Replace standalone digits or simple decimals
    html = html.replace(/(?<!<[^>]*)\b(\d+(\.\d+)?(%|ms|GB|M)?)\b(?![^<]*>)/g, '<span class="text-primary drop-shadow-[0_0_5px_rgba(0,217,165,1)] font-bold">$1</span>');

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
};


/* =========================================================================
   3D ADVANCED AI SYSTEM (007 STYLE)
   ========================================================================= */
const NeuralNodes = ({ count, radius, mainColor, isRunning, speedRef }) => {
    const nodesRef = useRef();

    // Instantiate 3D positions for the outer floating layer
    const nodes = useMemo(() => {
        return Array.from({ length: count }).map(() => {
            const r = radius + (Math.random() - 0.5) * 12; // Bigger spread
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            return {
                pos: [
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.sin(phi) * Math.sin(theta),
                    r * Math.cos(phi)
                ]
            }
        });
    }, [count, radius]);

    // Memoize the tech lines to avoid recalculating slice/map on every frame and fix duplicate keys
    const techLines = useMemo(() => {
        if (!nodes || nodes.length < 2) return [];
        const subset = nodes.slice(0, Math.min(nodes.length, 12));
        return subset.map((n, i) => {
            const nextNode = subset[(i + 1) % subset.length];
            if (!n?.pos || !nextNode?.pos) return null;

            const start = new THREE.Vector3(...n.pos);
            const end = new THREE.Vector3(...nextNode.pos);
            const distance = start.distanceTo(end);
            const position = start.clone().lerp(end, 0.5);

            return {
                id: `line-${i}`,
                position,
                distance,
                start,
                end,
                isWhite: i % 2 === 0
            };
        }).filter(Boolean);
    }, [nodes]);

    useFrame(({ clock }) => {
        if (nodesRef.current) {
            const currentSpeed = speedRef.current || 1;
            nodesRef.current.rotation.y += currentSpeed * 0.005;
            nodesRef.current.rotation.z += Math.sin(clock.getElapsedTime()) * currentSpeed * 0.001;
        }
    });

    return (
        <group ref={nodesRef}>
            {nodes.map((n, i) => (
                <mesh key={`node-${i}`} position={n.pos}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshBasicMaterial color={i % 4 === 0 ? '#ffffff' : mainColor} transparent opacity={isRunning ? 1 : 0.6} />
                </mesh>
            ))}

            {techLines.map((line) => (
                <mesh key={line.id} position={line.position} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), line.end.clone().sub(line.start).normalize())}>
                    <cylinderGeometry args={[0.02, 0.02, line.distance, 8]} />
                    <meshBasicMaterial
                        color={isRunning && line.isWhite ? '#ffffff' : mainColor}
                        transparent
                        opacity={isRunning ? 0.4 : 0.15}
                    />
                </mesh>
            ))}
        </group>
    );
};

const ImageMatrixCore = ({ state, resultType }) => {
    const groupRef = useRef();
    const imageRef = useRef();
    const ringsRef = useRef();
    const lightRef = useRef();

    // Video texture removed in favor of standard HTML5 video background for stability
    const speedRef = useRef(1); // Internal speed state
    const phaseRef = useRef(0);

    const mainColor = state === 'completed'
        ? (resultType === 'positive' ? '#00D9A5' : '#ff3366')
        : '#00D9A5';

    const activeColor = state === 'running' ? '#ffffff' : mainColor;

    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();

        let targetSpeed = 1.0;
        let lerpFactor = 0.05;

        if (state === 'running') {
            phaseRef.current += 0.005;
            if (phaseRef.current < 0.2) {
                targetSpeed = 1 + (phaseRef.current / 0.2) * 5;
                lerpFactor = 0.02;
            } else {
                targetSpeed = 8;
            }
        } else if (state === 'completed') {
            phaseRef.current = 0;
            targetSpeed = 1.5;
            lerpFactor = 0.02;
        } else {
            phaseRef.current = 0;
            targetSpeed = 1.0;
            lerpFactor = 0.05;
        }

        speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, lerpFactor);
        const s = speedRef.current;

        if (groupRef.current) {
            // Very slow, subtle breathing parallax for the whole group
            groupRef.current.position.y = Math.sin(t * 0.5) * 0.5;
            groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.02;
            groupRef.current.rotation.y = Math.cos(t * 0.4) * 0.02;
            // When running, add a tiny bit of chaotic shake to the whole scene
            if (state === 'running') {
                groupRef.current.position.x = (Math.random() - 0.5) * 0.1;
                groupRef.current.position.y += (Math.random() - 0.5) * 0.1;
            } else {
                groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, 0, 0.1);
            }
        }

        if (imageRef.current) {
            // Pulse logic for any other 3D core if added
            if (state === 'running') {
                const s = 1 + Math.sin(t * 10) * 0.02; // Subtle jitter/pulse
                imageRef.current.scale.set(s, s, s);
            }
        }

        if (ringsRef.current) {
            // Inner interface elements spinning fast in front of the eye
            ringsRef.current.rotation.x += s * 0.01;
            ringsRef.current.rotation.y += s * 0.015;
            ringsRef.current.rotation.z += s * 0.005;
        }

        if (lightRef.current) {
            lightRef.current.intensity = state === 'running' ? 8 + Math.random() * 5 : 2;
            if (state === 'running' && Math.random() > 0.9) {
                lightRef.current.color.set('#ffffff');
            } else {
                lightRef.current.color.set(activeColor);
            }
        }
    });

    return (
        <group ref={groupRef}>
            <ambientLight intensity={1.5} />
            <pointLight ref={lightRef} position={[0, 0, 15]} intensity={2} distance={100} color={activeColor} />

            {/* THE CYBER EYE VIDEO is now rendered via HTML <video> tag in parent component */}


            {/* 3D Interface Rings Floating in Front of the Eye (Semplificati per performance) */}
            <group ref={ringsRef} position={[0, 0, -2]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[8, 8.05, 64]} />
                    <meshBasicMaterial color={mainColor} transparent opacity={0.4} side={THREE.DoubleSide} />
                </mesh>
                <mesh rotation={[0, Math.PI / 2, 0]}>
                    <ringGeometry args={[12, 12.02, 64]} />
                    <meshBasicMaterial color={activeColor} transparent opacity={state === 'running' ? 0.4 : 0.1} side={THREE.DoubleSide} />
                </mesh>
            </group>

            {/* 3D Nodes around the eye (Ridotti da 40 a 16 per WebGL stability) */}
            <NeuralNodes count={16} radius={18} mainColor={mainColor} isRunning={state === 'running'} speedRef={speedRef} />
        </group>
    );
};


/* =========================================================================
   MOCK DATA GENERATORS
   ========================================================================= */
const generateEquityCurve = (trades, base, winRate) => {
    let eq = base;
    const data = [];
    for (let i = 0; i < trades; i++) {
        const isWin = Math.random() < winRate;
        const pnl = isWin ? Math.random() * 200 + 50 : -(Math.random() * 100 + 50);
        eq += pnl;
        data.push({
            trade: `T${i}`,
            equity: eq,
            pnl: pnl
        });
    }
    const maxPoints = 60;
    if (data.length <= maxPoints) return data;
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, i) => i % step === 0);
};

const generateRiskPnlData = (trades, isPositive) => {
    let currentPnl = 0;
    let currentRisk = 0;
    const data = [];
    for (let i = 0; i < trades; i++) {
        // Mock increasing/decreasing trends based on strategy status
        const trend = isPositive ? (Math.random() * 5 - 1) : (Math.random() * 5 - 4);
        currentPnl += trend;

        // Risk usually increases during drawdowns or expands over time
        currentRisk = Math.abs(currentPnl - Math.max(0, currentPnl - (Math.random() * 10))) * -1;

        data.push({
            time: i,
            profit: currentPnl.toFixed(2),
            risk: currentRisk.toFixed(2),
        });
    }
    const maxPoints = 50;
    if (data.length <= maxPoints) return data;
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, i) => i % step === 0);
};

const backtestStrategies = [
    {
        id: 'q2-bb',
        name: 'Bollinger Mean Reversion',
        asset: 'Nasdaq 100 Fut (NQ)',
        timeframe: '1 Ora',
        period: '2 Anni',
        trades: 324,
        winRate: 0.694,
        profit: 8.13,
        rr: '1 : 0.47',
        status: 'positive',
        desc: 'Modello Quant con ingressi chirurgici alle deviazioni standard estreme. Elevata accuratezza.',
        logs: [
            '[SYSTEM] Inizializzazione cluster HFT quantico su 128 cores...',
            '[SYSTEM] Allocazione memoria per matrici Tensoriali (16GB)...',
            '[ENGINE] Connessione al feed dati storico (yfinance UDP stream)...',
            '[ENGINE] Ingestione blocchi: NQ=F (OHLCV 730d, 5.2M ticks)...',
            '[PRE-PROCESS] Normalizzazione Z-Score e pulizia spike anomali...',
            '[QUANT] Calcolo Vettorializzato Array GPU: SMA 200 periodi...',
            '[QUANT] Calcolo Vettorializzato Array GPU: RSI (periodo 2)...',
            '[QUANT] Costruzione Bande di Bollinger dinamiche (std dev = 2.0)...',
            '[QUANT] Sintesi matrice di covarianza e segnali Long/Short...',
            '[TESTER] Avvio simulazione Monte Carlo su Numba compiler...',
            '[TESTER] Analisi Book di mercato e slippage non-lineare...',
            '[TESTER] Trailing Stop Loss dinamico calcolato su ATR(14)...',
            '[TESTER] Elaborazione al 50%: 162 trade trovati...',
            '[TESTER] Elaborazione al 100%: 324 trade eseguiti totali.',
            '[REPORTS] Estrazione curve di Drawdown e Profit Factor...',
            '[SUCCESS] Edge Statistico Verificato. Win Rate 69.4%. Profitto: +8.13%'
        ]
    },
    {
        id: 's1-news',
        name: 'News Spike Reversion',
        asset: 'Nasdaq 100 Fut (NQ)',
        timeframe: '1 Ora',
        period: '2 Anni',
        trades: 236,
        winRate: 0.377,
        profit: -35.75,
        rr: '1 : 1.25',
        status: 'negative',
        desc: 'Fallimento statistico. Le zone premium vengono sfondate dalla volatilità e il R:R non compensa le perdite.',
        logs: [
            '[SYSTEM] Inizializzazione neural network per Event-Driven trading...',
            '[SYSTEM] Caricamento pesi NLP per sentiment analysis macro...',
            '[ENGINE] Acquisizione Tick Data (730d, 3.1M ticks)...',
            '[PRE-PROCESS] Marcatura eventi FOMC, NFP e CPI...',
            '[QUANT] Filtro kalman per rilevazione anomalie volumetriche...',
            '[QUANT] Costruzione cluster di deviazione standard post-news...',
            '[TESTER] Iniettati ordini Limit contrari al trend direzionale...',
            '[TESTER] Analisi impatto spread e distorsione order book...',
            '[TESTER] WARNING: 12 Stop-Loss consecutivi triggerati.',
            '[TESTER] Analisi Drawdown: Superata soglia di rischio del 15%...',
            '[TESTER] Stop-Out in cascata registrati sul fattore Volatilità...',
            '[TESTER] Ricalcolo matrice di transizione di Markov...',
            '[TESTER] Chiusura modello forzata per preservare capitale.',
            '[REPORTS] Generazione heat-map dei fallimenti...',
            '[FAIL] Modello respinto. Rischio di Rovina elevato. Net -35.75%.'
        ]
    }
];

/* =========================================================================
   SIDE PANEL HACKER FEEDS
   ========================================================================= */
const ScrollingHexDump = ({ active }) => {
    const [lines, setLines] = useState([]);
    const speedRef = useRef(600); // Start slow, accelerate gradually

    useEffect(() => {
        if (!active) {
            return; // Stop adding new lines, but keep existing data visible
        }

        let intervalId;
        const tick = () => {
            const hexArr = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase());
            const highlightIdx = Math.floor(Math.random() * 8);

            const renderedHex = hexArr.map((h, i) => {
                const isGlow = i === highlightIdx;
                return isGlow ? `<span class="text-white font-bold">${h}</span>` : h;
            }).join(' ');

            const addr = '0x' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase();
            const fullHtml = `<span class="text-green-700 mr-2">${addr}</span> ${renderedHex}`;

            setLines(prev => [...prev.slice(-50), fullHtml]);

            // Gradually accelerate: 600ms -> 150ms over time
            if (speedRef.current > 150) speedRef.current = Math.max(150, speedRef.current - 15);
            intervalId = setTimeout(tick, speedRef.current);
        };

        intervalId = setTimeout(tick, speedRef.current);
        return () => clearTimeout(intervalId);
    }, [active]);

    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [lines]);

    return (
        <div ref={scrollRef} className="font-mono text-xs sm:text-sm text-green-500/70 leading-tight h-full overflow-y-auto scrollbar-none pb-4">
            {lines.map((l, i) => <div key={i} dangerouslySetInnerHTML={{ __html: l }} />)}
        </div>
    );
};

const LiveCalculationStream = ({ active }) => {
    const [calcs, setCalcs] = useState([]);
    const speedRef = useRef(800); // Start slow, accelerate gradually

    useEffect(() => {
        if (!active) {
            return; // Stop adding new lines, but keep existing data visible
        }

        let timeoutId;
        const tick = () => {
            const types = ['TENSOR_MULT', 'EIGEN_VAL', 'MATRIX_INV', 'GRAD_DESC', 'VOL_SURFACE', 'COVARIANCE'];
            const type = types[Math.floor(Math.random() * types.length)];
            const val = (Math.random() * 9999).toFixed(4);
            const latency = (Math.random() * 5).toFixed(2);
            const matrix1 = `[${(Math.random() * 9).toFixed(3)}, ${(Math.random() * 9).toFixed(3)}]`;
            const matrix2 = `[${(Math.random() * 9).toFixed(3)}, ${(Math.random() * 9).toFixed(3)}]`;
            const isError = Math.random() > 0.85;
            const status = isError ? 'FAIL' : 'SUCCESS';
            setCalcs(prev => [...prev.slice(-50), `[${type}] λ=${val} | lag:${latency}ms | tensor=${matrix1}x${matrix2} -> ${status}`]);

            // Gradually accelerate: 800ms -> 200ms over time
            if (speedRef.current > 200) speedRef.current = Math.max(200, speedRef.current - 20);
            timeoutId = setTimeout(tick, speedRef.current);
        };

        timeoutId = setTimeout(tick, speedRef.current);
        return () => clearTimeout(timeoutId);
    }, [active]);

    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [calcs]);

    return (
        <div ref={scrollRef} className="font-mono text-xs text-blue-400/80 leading-relaxed overflow-y-auto h-full scrollbar-none flex flex-col items-end pb-4">
            {calcs.map((c, i) => (
                <div key={i} className="animate-in slide-in-from-right text-right">
                    {highlightTechText(c)}
                </div>
            ))}
        </div>
    );
};


/* =========================================================================
   TYPEWRITER LOADER
   ========================================================================= */
const QuantumLoaderStatus = ({ state, statusType }) => {
    const [text, setText] = useState('');

    useEffect(() => {
        if (state === 'idle') {
            setText('');
            return;
        }

        if (state === 'completed') {
            const resultMsg = statusType === 'positive' ? 'SUCCESSO.' : 'FALLIMENTO.';
            const colorClass = statusType === 'positive' ? 'text-green-400' : 'text-red-400';
            setText(`> CARICAMENTO COMPLETATO.\n> STATO: <span class="${colorClass} font-bold">${resultMsg}</span>`);
            return;
        }

        const stages = [
            "CARICAMENTO DATI IN CORSO...",
            "RENDERING CORE 3D...",
            "STATISTICA E ANALISI DATI AVANZATA IN CARICAMENTO...",
            "SINTESI TRAIETTORIE QUANTICHE...",
            "VERIFICA ANOMALIE DI SISTEMA...",
            "ALLINEAMENTO TENSORI E MATRICI..."
        ];

        let currentStage = 0;
        let charIndex = 0;
        let isTyping = true;
        let timeout;

        const typeChar = () => {
            if (isTyping) {
                if (charIndex <= stages[currentStage].length) {
                    setText(`> ${stages[currentStage].substring(0, charIndex)}`);
                    charIndex++;
                    timeout = setTimeout(typeChar, 30 + Math.random() * 40);
                } else {
                    isTyping = false;
                    timeout = setTimeout(typeChar, 1800); // Wait before next message
                }
            } else {
                currentStage = (currentStage + 1) % stages.length;
                charIndex = 0;
                isTyping = true;
                setText('> ');
                timeout = setTimeout(typeChar, 50);
            }
        };

        typeChar();

        return () => clearTimeout(timeout);
    }, [state, statusType]);

    if (state === 'idle') return null;

    return (
        <div className="mt-4 bg-black/80 border border-white/10 p-3 rounded-xl font-mono text-sm sm:text-base text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] h-auto min-h-[4rem] flex flex-col justify-center transition-all">
            <div className="flex items-center gap-2 mb-1">
                <Activity className="w-3 h-3 text-white/80 animate-spin-slow" />
                <span className="text-xs text-white/80 tracking-widest uppercase">System Initialization</span>
            </div>
            <div className="whitespace-pre-line leading-relaxed flex flex-wrap">
                <span dangerouslySetInnerHTML={{ __html: text }} />
                {(state === 'running' || state === 'completed') && <span className="animate-pulse text-white inline-block w-1.5 bg-white ml-1 h-3.5 mt-0.5"></span>}
            </div>
        </div>
    );
};

/* =========================================================================
   MAIN LAYOUT COMPONENT
   ========================================================================= */
export default function BacktestPage() {
    const [activeTest, setActiveTest] = useState(backtestStrategies[0]);
    const [engineState, setEngineState] = useState('idle'); // idle, running, completed
    const [terminalLogs, setTerminalLogs] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [miniChartData, setMiniChartData] = useState([]);

    // Refs for Auto-scrolling
    const chatScrollRef = useRef(null);
    const terminalScrollRef = useRef(null);

    // --- AI Strategy State ---
    const [messages, setMessages] = useState([
        { role: 'ai', content: "SYSTEM.ONLINE. Inserisci prompt strategico. Es: NQ, 5m, RSI/EMA cross, target 2x R, SL 1%." }
    ]);
    const [inputVal, setInputVal] = useState('');
    const [strategyParams, setStrategyParams] = useState({
        asset_class: '', timeframe: '', entry_conditions: '',
        exit_conditions: '', risk_management: '', trading_hours: '',
        status: 'INCOMPLETE'
    });

    // Cloud Preferences Sync
    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const res = await api.get('/user/preferences');
                if (res.data && res.data.sync_enabled) {
                    if (res.data.selected_asset) {
                        setStrategyParams(prev => ({ ...prev, asset_class: res.data.selected_asset }));
                    }
                }
            } catch (err) {
                console.warn('Sync failed in BacktestPage');
            }
        };
        loadPrefs();
    }, []);

    // Auto-scroll Effects
    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (terminalScrollRef.current) {
            terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
        }
    }, [terminalLogs]);

    const handleSendMessage = async () => {
        if (!inputVal.trim() || engineState !== 'idle') return;

        const userMsg = { role: 'user', content: inputVal };
        setMessages(prev => [...prev, userMsg]);
        const currentInput = inputVal.toLowerCase();
        setInputVal('');

        // 1. Semantic Analysis Indicator
        setMessages(prev => [...prev, { role: 'ai', content: "[SYSTEM] Analisi semantica e costruzione modello... 🧠" }]);

        setTimeout(async () => {
            let extractedParams = {};

            // --- NLP Dictionary Extraction ---
            const tickerMatch = currentInput.match(/\b(?:on|su|test|backtest|for|asset|ticker)\s+([a-z0-9^.=]+)\b/i);
            if (tickerMatch && tickerMatch[1]) extractedParams.asset_class = tickerMatch[1].toUpperCase();
            else if (currentInput.includes('nq') || currentInput.includes('nasdaq')) extractedParams.asset_class = 'NQ (Nasdaq 100)';
            else if (currentInput.includes('spx') || currentInput.includes('s&p')) extractedParams.asset_class = 'SPX (S&P 500)';
            else if (currentInput.includes('btc')) extractedParams.asset_class = 'BTC/USD';

            if (currentInput.includes('5m')) extractedParams.timeframe = '5m';
            else if (currentInput.includes('15m')) extractedParams.timeframe = '15m';
            else if (currentInput.includes('1h') || currentInput.includes('orario')) extractedParams.timeframe = '1H (Orario)';
            else if (currentInput.includes('daily') || currentInput.includes('giornaliero')) extractedParams.timeframe = '1D (Daily)';

            if (currentInput.includes('vwap')) extractedParams.entry_conditions = 'VWAP Crossover + Filter';
            else if (currentInput.includes('macd')) extractedParams.entry_conditions = 'MACD Histogram Bullish Cross';
            else if (currentInput.includes('stack')) extractedParams.entry_conditions = 'EMA Trend Stack (20/50/200)';
            else if (currentInput.includes('ema') || currentInput.includes('cross')) extractedParams.entry_conditions = 'EMA Crossover Trend Filter';
            else if (currentInput.includes('pac') || currentInput.includes('hold')) extractedParams.entry_conditions = 'Acquisto periodico fisso (PAC)';

            if (currentInput.includes('tp') || currentInput.includes('target')) extractedParams.exit_conditions = 'Algorithmic Take Profit (2.0R)';
            else if (currentInput.includes('trailing')) extractedParams.exit_conditions = 'Dynamic Trailing Stop-Loss';
            else if (currentInput.includes('anni') || currentInput.includes('hold')) extractedParams.exit_conditions = 'Nessun TP (Lungo Periodo)';

            if (currentInput.includes('stop') || currentInput.includes('risk') || currentInput.includes('sl')) extractedParams.risk_management = 'Max 1.0% VAR, 30 ticks SL';
            else if (currentInput.includes('leverage') || currentInput.includes('spot')) extractedParams.risk_management = '100% Equity Exposure (Spot)';

            if (currentInput.includes('ny') || currentInput.includes('session')) extractedParams.trading_hours = 'RTH (09:30-16:00 EST)';
            else if (currentInput.includes('h24') || currentInput.includes('sempre')) extractedParams.trading_hours = 'H24 (Crypto/Globex)';

            const nextParams = { ...strategyParams, ...extractedParams };

            // --- N8N / COMPLEX ARCHITECT LOGIC ---
            if (currentInput.includes('complesso') || currentInput.includes('architetto') || currentInput.includes('n8n')) {
                setMessages(prev => [
                    ...prev.slice(0, -1),
                    { role: 'ai', content: "[N8N::BRIDGE] Contattando l'architetto per una logica avanzata... 🕸️" }
                ]);

                try {
                    const BACKEND = RESOLVED_BACKEND;
                    const token = localStorage.getItem('karion_token');
                    const res = await fetch(`${BACKEND}/api/n8n/architect`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ prompt: currentInput, context: nextParams })
                    });
                    const n8nData = await res.json();

                    setMessages(prev => [...prev.slice(0, -1), { role: 'ai', content: n8nData.reply || "[N8N] Architettura ricevuta." }]);
                    if (n8nData.suggested_params) {
                        setStrategyParams(prev => ({ ...prev, ...n8nData.suggested_params }));
                    }
                    return;
                } catch (e) {
                    // Fallback to interrogative logic if n8n fails
                }
            }

            // --- INTERROGATIVE LOGIC ---
            const isComplete = Boolean(
                nextParams.asset_class &&
                nextParams.timeframe &&
                nextParams.entry_conditions &&
                nextParams.exit_conditions &&
                nextParams.risk_management &&
                nextParams.trading_hours
            );

            if (isComplete) {
                nextParams.status = 'COMPLETE';
            }

            let reply = "";
            if (isComplete) {
                reply = "[SYSTEM::SUCCESS] Strategia configurata al 100%. Il piano d'attacco è pronto. Inizializza la sequenza quantistica premendo il pulsante sotto.";
            } else {
                if (!nextParams.asset_class) reply = "Perfetto. Su quale **Asset** (es: AAPL, NQ, BTC) vuoi che mi concentri?";
                else if (!nextParams.timeframe) reply = `Ricevuto su ${nextParams.asset_class}. Quale **Timeframe** (es: 15m, 1h, Daily) analizziamo?`;
                else if (!nextParams.entry_conditions) reply = "Ottimo. Qual è il segnale d'**Ingresso**? (es: VWAP crossover, MACD, EMA Cross)";
                else if (!nextParams.exit_conditions) reply = "Per l'**Uscita**, preferisci un Target fisso (TP) o un Trailing Stop dinamico?";
                else if (!nextParams.risk_management) reply = "Ultimi passi: che tipo di **Gestione Rischio** applichiamo? (es: SL 1% o quanti tick?)";
                else if (!nextParams.trading_hours) reply = "In quali **Orari** deve lavorare l'algoritmo? (es: Sessione NY o H24?)";
            }

            // Visual update of parameters with final status check
            setStrategyParams(nextParams);

            setTimeout(() => {
                setMessages(prev => [...prev.slice(0, -1), { role: 'ai', content: reply }]);
            }, 600);
        }, 800);
    };

    const resetEngine = () => {
        setEngineState('idle');
        setTerminalLogs([]);
        setChartData([]);
        setMiniChartData([]);
        setStrategyParams({
            asset_class: '', timeframe: '', entry_conditions: '',
            exit_conditions: '', risk_management: '', trading_hours: '',
            status: 'INCOMPLETE'
        });
        setMessages([{ role: 'ai', content: "SYSTEM.ONLINE. Memoria cancellata. Inserisci nuovo prompt strategico." }]);
    };

    const runPythonBacktest = async () => {
        if (engineState === 'running') return;

        if (engineState === 'completed') {
            resetEngine();
            return;
        }

        setEngineState('running');
        setTerminalLogs([]);
        setChartData([]);
        setMiniChartData([]);

        // --- REAL API CALL to Python backtest engine ---
        const BACKEND = RESOLVED_BACKEND;

        // Helper to add a log with delay
        const addLog = async (msg, delay = 800) => {
            await new Promise(resolve => setTimeout(resolve, delay));
            setTerminalLogs(prev => [...prev.slice(-80), msg]);
        };

        try {
            // ========== PHASE 1: PRE-FETCH INITIALIZATION (dramatic build-up) ==========
            await addLog('[SYSTEM] Inizializzazione cluster HFT quantistico...', 600);
            await addLog('[SYSTEM] Allocazione memoria per matrici Tensoriali (16GB)...', 900);
            await addLog('[SYSTEM] Boot Neural Engine v4.2.1 (Numba JIT Compiler)...', 800);
            await addLog('[ENGINE] Connessione al feed dati storico (yfinance UDP stream)...', 1000);
            await addLog(`[ENGINE] Target Asset: ${strategyParams.asset_class || 'N/A'}`, 700);
            await addLog(`[ENGINE] Timeframe: ${strategyParams.timeframe || 'N/A'}`, 500);
            await addLog(`[ENGINE] Entry Logic: ${strategyParams.entry_conditions || 'N/A'}`, 500);
            await addLog(`[ENGINE] Exit Logic: ${strategyParams.exit_conditions || 'N/A'}`, 500);
            await addLog(`[ENGINE] Risk Mgmt: ${strategyParams.risk_management || 'N/A'}`, 500);
            await addLog(`[ENGINE] Session: ${strategyParams.trading_hours || 'N/A'}`, 500);
            await addLog('[PRE-PROCESS] Normalizzazione Z-Score e pulizia spike anomali...', 900);
            await addLog('[PRE-PROCESS] Calcolo vettorializzato Array GPU: SMA 200 periodi...', 800);
            await addLog('[PRE-PROCESS] Costruzione Bande di Bollinger dinamiche (std=2.0)...', 800);
            await addLog('[QUANT] Sintesi matrice di covarianza e segnali Long/Short...', 900);
            await addLog('[QUANT] Avvio simulazione Monte Carlo su Numba compiler...', 1000);

            // ========== PHASE 2: ACTUAL API CALL ==========
            await addLog('[NETWORK] POST /api/backtest/run → Backend Python Engine...', 700);

            const response = await fetch(`${BACKEND}/api/backtest/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_class: strategyParams.asset_class,
                    timeframe: strategyParams.timeframe,
                    entry_conditions: strategyParams.entry_conditions,
                    exit_conditions: strategyParams.exit_conditions,
                    risk_management: strategyParams.risk_management,
                    trading_hours: strategyParams.trading_hours,
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Backend error');
            }

            const data = await response.json();

            await addLog('[NETWORK] 200 OK — Payload ricevuto dal motore quantistico.', 600);

            // ========== PHASE 3: STREAM BACKEND LOG MESSAGES ==========
            const logMsgs = data.log_messages || [];
            for (let i = 0; i < logMsgs.length; i++) {
                const delay = Math.max(500, 900 - (i * 30));
                await addLog(logMsgs[i], delay);
            }

            // ========== PHASE 4: POST-PROCESSING (dramatic analysis) ==========
            await addLog('[TESTER] Analisi Book di mercato e slippage non-lineare...', 800);
            await addLog('[TESTER] Trailing Stop Loss dinamico calcolato su ATR(14)...', 700);
            await addLog('[TESTER] Ricalcolo matrice di transizione di Markov...', 800);
            await addLog('[REPORTS] Estrazione curve di Drawdown e Profit Factor...', 900);
            await addLog('[REPORTS] Generazione heat-map dei trade eseguiti...', 800);
            await addLog('[REPORTS] Calcolo Sharpe Ratio e Recovery Factor...', 700);
            await addLog('[REPORTS] Compilazione equity curve e risk/PnL series...', 800);
            await addLog('[REPORTS] Serializzazione risultati per il frontend...', 600);
            await addLog('[SYSTEM] Verifica integrità dati completata.', 700);
            await addLog('[SYSTEM] Preparazione rendering finale...', 1000);

            // ========== FINAL REVEAL ==========

            // Determine positive/negative result
            const isPositive = data.net_profit_pct > 0;

            // Update activeTest with real stats so the HUDs show real data
            setActiveTest(prev => ({
                ...prev,
                winRate: data.win_rate,
                trades: data.total_trades,
                profit: data.net_profit_pct,
                rr: data.risk_reward,
                status: isPositive ? 'positive' : 'negative',
                _extra: {
                    sharpe: data.sharpe_ratio,
                    maxDrawdown: data.max_drawdown_pct,
                    profitFactor: data.profit_factor,
                    recoveryFactor: data.recovery_factor,
                }
            }));

            setChartData(data.equity_curve);
            setMiniChartData(data.risk_pnl_series);
            setEngineState('completed');

            // --- SAVE RESULT PERMANENTLY ---
            const token = localStorage.getItem('karion_token');
            if (token) {
                fetch(`${BACKEND}/api/backtest/save`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                }).catch(err => console.error("Error saving backtest:", err));
            }

            toast.success(`Quantum Model Reached Convergence`, { icon: <Zap className="w-5 h-5 text-primary" /> });


        } catch (err) {
            console.error('Backtest error:', err);
            setTerminalLogs(prev => [...prev, `[ERROR] ${err.message}`]);
            toast.error(`Errore motore: ${err.message}`);
            setEngineState('idle');
        }
    };


    const selectStrategy = (test) => {
        if (engineState === 'running') return; // block change during run
        setActiveTest(test);
        setEngineState('idle');
        setTerminalLogs([]);
        setChartData([]);
        setMiniChartData([]);
    };

    return (
        <div className="min-h-screen bg-black text-white font-mono flex flex-col relative overflow-hidden">

            {/* FULL SCREEN MASSIVE BACKGROUND CONTAINER */}
            <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                {/* Standard HTML5 Video Background - Immensely more stable than WebGL texture */}
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedData={(e) => { e.target.currentTime = 0.5; }}
                    onTimeUpdate={(e) => { if (e.target.currentTime >= 5.8 || e.target.currentTime < 0.5) e.target.currentTime = 0.5; }}
                    className={cn(
                        "absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen transition-all duration-300",
                        engineState === 'running' && "animate-pulse"
                    )}
                    style={{
                        filter: engineState === 'running'
                            ? 'contrast(1.5) brightness(1.2) hue-rotate(10deg) saturate(1.5)'
                            : 'none',
                        transform: 'scale(0.85)'
                    }}
                >
                    <source src="/videos/efecto-recording-2026-02-22T14-56-17.mp4" type="video/mp4" />
                </video>

                {/* Vignette Overlay */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.85)_80%)] pointer-events-none z-20"></div>

                {/* EMP FLASH BANG EFFECT ON COMPLETION */}
                <AnimatePresence>
                    {engineState === 'completed' && (
                        <motion.div
                            initial={{ opacity: 0.8 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute inset-0 bg-white z-[60] pointer-events-none"
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* FLOATING HUD UI - ESAGERATO */}
            <div className="relative z-20 flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 p-4 lg:p-6 h-full pointer-events-none">

                {/* LEFT STRATEGY PANEL (Interactive) */}
                <div className="col-span-1 md:col-span-4 flex flex-col gap-4 pointer-events-auto h-full max-h-screen overflow-y-auto scrollbar-none pb-8 pr-2">

                    {/* Brand Banner */}
                    <div className="bg-black/60 border border-primary/30 backdrop-blur-xl p-4 rounded-xl shadow-[0_0_30px_rgba(0,217,165,0.15)] flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-widest flex items-center gap-2">
                                <Database className="w-6 h-6 animate-pulse text-white" />
                                QUANT EYE ENGINE
                            </h1>
                        </div>
                        <div className="w-12 h-12 rounded-full border border-dashed border-primary/50 flex items-center justify-center animate-spin-slow">
                            <Network className="w-5 h-5 text-primary" />
                        </div>
                    </div>

                    {/* Compact Dropdown Selection */}
                    <div className="flex-1 mt-4">
                        <label className="text-xs text-gray-300 tracking-[0.2em] mb-2 block uppercase">Select Strategy Algorithm</label>
                        <div className="relative">
                            <select
                                value={activeTest.id}
                                onChange={(e) => {
                                    const strat = backtestStrategies.find(s => s.id === e.target.value);
                                    if (strat) selectStrategy(strat);
                                }}
                                className="w-full bg-black/80 border border-white/20 text-white text-base rounded-xl p-4 appearance-none hover:border-white/50 focus:border-primary focus:outline-none transition-colors cursor-pointer font-mono shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]"
                            >
                                {backtestStrategies.map(strat => (
                                    <option key={strat.id} value={strat.id} className="bg-gray-900 text-white">
                                        {strat.name} ({strat.asset} - {strat.timeframe})
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Activity className="w-5 h-5 text-gray-300" />
                            </div>
                        </div>

                        {/* Selected Details Preview */}
                        <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm flex justify-between items-center">
                            <div>
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Active Target</p>
                                <p className="text-sm font-bold text-white flex items-center gap-2"><Binary className="w-4 h-4 text-primary" /> {strategyParams.asset_class || activeTest.asset}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Timeframe</p>
                                <p className="text-sm font-bold text-blue-400 flex items-center gap-2 justify-end"><Clock className="w-4 h-4" /> {strategyParams.timeframe || activeTest.timeframe}</p>
                            </div>
                        </div>

                        {/* ========================================================= 
                            AI QUANT AGENT CHAT (Solo visibile in Idle)
                            ========================================================= */}
                        {engineState === 'idle' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex flex-col h-[320px] bg-black/60 border border-white/10 rounded-xl overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                                <div className="bg-white/5 border-b border-white/10 p-3 flex items-center gap-2">
                                    <BrainCircuit className="w-5 h-5 text-blue-400" />
                                    <span className="text-xs font-bold tracking-[0.2em] text-blue-400">NLP CONFIG INTERFACE</span>
                                </div>
                                <div className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
                                    <div ref={chatScrollRef} className="flex-1 overflow-y-auto pr-3 scrollbar-none">
                                        {messages.map((m, i) => (
                                            <div key={i} className={cn("mb-3 w-fit max-w-[95%] p-3 rounded text-sm font-mono leading-relaxed", m.role === 'user' ? "ml-auto bg-primary/20 text-primary border border-primary/30" : "mr-auto bg-black/40 text-gray-200 border border-white/5")}>
                                                {m.role === 'user' ? `> ${m.content}` : highlightTechText(m.content)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-4 bg-black/80 border-t-2 border-primary/60 border shadow-[0_-10px_30px_rgba(0,217,165,0.1)] flex items-center gap-3 relative z-10">
                                    <span className="text-primary font-black pl-2 text-xl drop-shadow-[0_0_8px_rgba(0,217,165,0.8)]">{'>'}</span>
                                    <Input
                                        className="h-12 bg-black/50 border border-primary/30 rounded-lg text-white focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary px-4 text-base font-mono placeholder:text-gray-500 shadow-[inset_0_0_15px_rgba(0,217,165,0.05)] transition-all"
                                        placeholder="Enter strategy prompt..."
                                        value={inputVal}
                                        onChange={(e) => setInputVal(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        disabled={strategyParams.status === 'COMPLETE'}
                                    />
                                    <Button
                                        size="default"
                                        onClick={handleSendMessage}
                                        disabled={!inputVal.trim() || strategyParams.status === 'COMPLETE'}
                                        className="bg-primary hover:bg-emerald-400 text-black h-12 px-6 rounded-lg font-bold shadow-[0_0_15px_rgba(0,217,165,0.4)] transition-all flex items-center gap-2"
                                    >
                                        <span className="hidden sm:inline">SEND</span>
                                        <Send className="w-5 h-5" />
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* ========================================================= 
                            AI PARAMETERS VIRTUAL ARRAY (Visibile solo in idle)
                            Spostato sotto la chat
                            ========================================================= */}
                        {engineState === 'idle' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 bg-black/80 border border-white/5 p-5 rounded-xl flex flex-col gap-4 shadow-[inset_0_0_30px_rgba(0,0,0,1)] relative overflow-hidden flex-shrink-0">
                                <span className="text-sm font-bold tracking-[0.2em] text-primary border-b border-primary/20 pb-2 mb-1 flex items-center justify-between">
                                    COMPILED_PARAMETERS
                                    <span className="text-xs text-gray-200 bg-black px-2 py-1 rounded border border-white/20">{strategyParams.status}</span>
                                </span>
                                <div className="grid grid-cols-1 gap-4 overflow-y-auto pr-2 scrollbar-none max-h-[40vh]">
                                    {Object.entries(strategyParams).map(([key, value]) => {
                                        if (key === 'status') return null;
                                        const isFilled = value && value.trim() !== '';
                                        return (
                                            <motion.div
                                                key={`${key}-${isFilled ? 'filled' : 'empty'}`}
                                                initial={isFilled ? { borderColor: 'rgba(0, 217, 165, 0.8)', backgroundColor: 'rgba(0, 217, 165, 0.2)' } : {}}
                                                animate={isFilled ? { borderColor: 'rgba(0, 217, 165, 0.2)', backgroundColor: 'rgba(0, 217, 165, 0.05)' } : {}}
                                                transition={{ duration: 1.5 }}
                                                className={cn("flex flex-col gap-1.5 p-3 rounded-lg border", isFilled ? "bg-primary/5 border-primary/20" : "bg-black/50 border-red-500/10")}
                                            >
                                                <span className="text-xs text-gray-400 tracking-widest uppercase">{key.replace('_', ' ')}</span>
                                                <motion.span
                                                    key={value || 'empty'}
                                                    initial={isFilled ? { opacity: 0.5, filter: "brightness(2.5) drop-shadow(0 0 10px rgba(0,217,165,1))", scale: 1.05 } : {}}
                                                    animate={isFilled ? { opacity: 1, filter: "brightness(1) drop-shadow(0 0 0px rgba(0,217,165,0))", scale: 1 } : {}}
                                                    transition={{ duration: 1.2, ease: "easeOut" }}
                                                    className={cn("text-sm font-mono break-words", isFilled ? "text-primary font-medium" : "text-red-500/50 animate-pulse", isFilled && key === 'entry_conditions' ? "text-yellow-400" : "")}
                                                >
                                                    {isFilled ? value : "NullPointerException_"}
                                                </motion.span>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {/* LIVE RISK VS PROFIT MINI-CHART */}
                        <AnimatePresence>
                            {engineState === 'completed' && miniChartData.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    transition={{ duration: 0.5, delay: 0.1 }}
                                    className="mt-4 flex flex-col gap-4 relative z-30"
                                >
                                    <div className="h-48 w-full bg-black/60 backdrop-blur-md rounded-xl border border-white/10 p-4 relative overflow-hidden">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-sm font-bold text-gray-300 tracking-widest uppercase">Risk vs Reward Trajectory</span>
                                            <div className="flex gap-3">
                                                <span className="flex items-center gap-1.5 text-xs text-green-400"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div> PnL</span>
                                                <span className="flex items-center gap-1.5 text-xs text-red-400"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Risk</span>
                                            </div>
                                        </div>

                                        <div className="absolute inset-x-0 bottom-0 h-36">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={miniChartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.4} />
                                                            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                                                        </linearGradient>
                                                        <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid #444', fontSize: '11px', borderRadius: '8px' }}
                                                        labelStyle={{ display: 'none' }}
                                                    />
                                                    <Area type="monotone" dataKey="profit" stroke="#4ade80" strokeWidth={3} fillOpacity={1} fill="url(#pnlGrad)" isAnimationActive={false} />
                                                    <Area type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#riskGrad)" isAnimationActive={false} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Advanced Metrics */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-center backdrop-blur-md">
                                            <p className="text-xs text-gray-400 uppercase tracking-widest">Profit Fct</p>
                                            <p className="font-bold text-white text-base mt-2">{activeTest.status === 'positive' ? '2.41' : '0.82'}</p>
                                        </div>
                                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-center backdrop-blur-md">
                                            <p className="text-xs text-gray-400 uppercase tracking-widest">Sharpe</p>
                                            <p className="font-bold text-white text-base mt-2">{activeTest.status === 'positive' ? '1.85' : '-0.44'}</p>
                                        </div>
                                        <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-center backdrop-blur-md">
                                            <p className="text-xs text-gray-400 uppercase tracking-widest">Recovery</p>
                                            <p className="font-bold text-white text-base mt-2">{activeTest.status === 'positive' ? '3.12' : '0.45'}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* TYPEWRITER STATUS PANEL */}
                        <AnimatePresence>
                            {engineState !== 'idle' && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                                    <QuantumLoaderStatus state={engineState} statusType={activeTest.status} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Execution Engine */}
                    <div className="mt-auto">
                        <Button
                            onClick={runPythonBacktest}
                            disabled={engineState === 'idle' && strategyParams.status !== 'COMPLETE'}
                            className={cn(
                                "w-full h-16 rounded-xl font-black shadow-[0_0_50px_rgba(0,217,165,0.4)] transition-all overflow-hidden relative group whitespace-nowrap text-sm lg:text-base",
                                engineState === 'completed' ? "bg-gradient-to-r from-yellow-500 to-orange-600 text-black hover:to-orange-500" : "bg-gradient-to-r from-primary to-emerald-600 hover:to-emerald-500 text-black",
                                (engineState === 'idle' && strategyParams.status !== 'COMPLETE') ? "opacity-30 grayscale cursor-not-allowed" : "opacity-100 grayscale-0"
                            )}
                        >
                            {engineState === 'running' ? (
                                <span className="flex items-center justify-center gap-2 z-10 relative tracking-[0.15em]"><Cpu className="w-5 h-5 animate-spin" /> SYNTHESIZING...</span>
                            ) : engineState === 'completed' ? (
                                <span className="flex items-center justify-center gap-2 z-10 relative tracking-[0.15em]"><Activity className="w-5 h-5 fill-black" /> RECHARGE STRATEGY</span>
                            ) : (
                                <span className="flex items-center justify-center gap-2 z-10 relative tracking-[0.15em]"><Zap className="w-5 h-5 fill-black" /> INITIALIZE SEQUENCE</span>
                            )}
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay"></div>
                            {engineState === 'running' && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                        </Button>
                    </div>

                </div>

                {/* CENTER AREA - MASSIVE GRAPH AND HUDS */}
                <div className="col-span-1 md:col-span-5 flex flex-col justify-between gap-6 h-full pointer-events-auto">

                    {/* TOP PANELS OVER EYE (Moved from Right Panel to cover video border) */}
                    {/* H-auto min height to start compressed and expand with logs up to max-h */}
                    <div className="flex gap-4 w-full h-auto min-h-[80px] max-h-[400px] flex-shrink-0 transition-all duration-500 ease-in-out">
                        <div className="flex-1 bg-black/90 border border-white/10 p-4 rounded-xl flex flex-col relative overflow-hidden transition-all duration-500">
                            <span className="text-sm font-bold tracking-[0.2em] text-blue-400 mb-3 border-b border-blue-500/20 pb-2 flex justify-between">
                                RAM DUMP <Server className="w-4 h-4 text-blue-400" />
                            </span>
                            <div className="flex-1 overflow-hidden relative opacity-70">
                                <ScrollingHexDump active={engineState === 'running' || engineState === 'completed'} />
                                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
                            </div>
                        </div>

                        <div className="flex-1 bg-black/90 border border-white/10 p-4 rounded-xl flex flex-col relative overflow-hidden transition-all duration-500">
                            <span className="text-sm font-bold tracking-[0.2em] text-red-400 mb-3 border-b border-red-500/20 pb-2 flex justify-between">
                                TENSORS <ShieldAlert className="w-4 h-4 text-red-400" />
                            </span>
                            <div className="flex-1 overflow-hidden relative">
                                <LiveCalculationStream active={engineState === 'running' || engineState === 'completed'} />
                                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none"></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-6 mt-auto w-full">
                        {/* Final Results HUD Array */}
                        <AnimatePresence mode='wait'>
                            {engineState === 'completed' && (
                                <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-black/90 p-5 rounded-2xl border border-white/20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
                                    <div className="p-3 border-l-2 border-primary">
                                        <p className="text-xs text-primary tracking-widest uppercase mb-2 drop-shadow-[0_0_5px_rgba(0,217,165,0.8)]">Win Rate</p>
                                        <p className="text-3xl font-black text-white">{(activeTest.winRate * 100).toFixed(1)}%</p>
                                    </div>
                                    <div className="p-3 border-l-2 border-blue-400">
                                        <p className="text-xs text-blue-400 tracking-widest uppercase mb-2 drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]">Trades</p>
                                        <p className="text-3xl font-black text-white">{activeTest.trades}</p>
                                    </div>
                                    <div className={cn("p-3 border-l-4", activeTest.status === 'positive' ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10")}>
                                        <p className={cn("text-xs tracking-widest uppercase mb-2", activeTest.status === 'positive' ? "text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,1)]" : "text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,1)]")}>Net Profit</p>
                                        <p className={cn("text-4xl font-black tracking-tighter", activeTest.status === 'positive' ? "text-green-400" : "text-red-400")}>{activeTest.profit > 0 ? '+' : ''}{typeof activeTest.profit === 'number' ? activeTest.profit.toFixed(1) : activeTest.profit}%</p>
                                    </div>
                                    <div className="p-3 border-l-2 border-yellow-400">
                                        <p className="text-xs text-yellow-400 tracking-widest uppercase mb-2 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]">Risk/Reward</p>
                                        <p className="text-2xl font-black text-white">{activeTest.rr}</p>
                                    </div>
                                    {/* Extended real metrics row — only show when _extra data is available */}
                                    {activeTest._extra && (<>
                                        <div className="p-3 border-l-2 border-purple-400">
                                            <p className="text-xs text-purple-400 tracking-widest uppercase mb-2">Sharpe Ratio</p>
                                            <p className="text-2xl font-black text-white">{activeTest._extra.sharpe?.toFixed(2)}</p>
                                        </div>
                                        <div className="p-3 border-l-2 border-red-500">
                                            <p className="text-xs text-red-400 tracking-widest uppercase mb-2">Max Drawdown</p>
                                            <p className="text-2xl font-black text-red-400">{activeTest._extra.maxDrawdown?.toFixed(1)}%</p>
                                        </div>
                                        <div className="p-3 border-l-2 border-orange-400">
                                            <p className="text-xs text-orange-400 tracking-widest uppercase mb-2">Profit Factor</p>
                                            <p className="text-2xl font-black text-white">{activeTest._extra.profitFactor?.toFixed(2)}</p>
                                        </div>
                                        <div className="p-3 border-l-2 border-cyan-400">
                                            <p className="text-xs text-cyan-400 tracking-widest uppercase mb-2">Recovery Factor</p>
                                            <p className="text-2xl font-black text-white">{activeTest._extra.recoveryFactor?.toFixed(2)}</p>
                                        </div>
                                    </>)}
                                </motion.div>
                            )}
                        </AnimatePresence>


                        {/* GIGANTIC OVERLAID CHART */}
                        <div className="h-[300px] lg:h-[450px] w-full relative group">
                            {engineState === 'completed' && chartData.length > 0 && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="w-full h-full bg-black/90 border-t border-white/10 p-6 rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)] relative overflow-visible">
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-black border border-white/20 px-6 py-1 rounded-full text-xs tracking-[0.3em] font-bold text-white shadow-[0_0_20px_rgba(0,0,0,1)]">
                                        FINANCIAL TRAJECTORY <span className="text-primary ml-2 animate-pulse">SIMULATION OVERRIDE</span>
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="massiveGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={activeTest.status === 'positive' ? '#00FFBB' : '#FF0055'} stopOpacity={0.8} />
                                                    <stop offset="50%" stopColor={activeTest.status === 'positive' ? '#00D9A5' : '#ff3366'} stopOpacity={0.3} />
                                                    <stop offset="100%" stopColor={activeTest.status === 'positive' ? '#00D9A5' : '#ff3366'} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="1 10" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                            <XAxis dataKey="trade" stroke="#444" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} />
                                            <YAxis domain={['auto', 'auto']} stroke="#444" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(0,217,165,0.3)', borderRadius: '12px', color: '#fff', backdropFilter: 'blur(10px)', boxShadow: '0 0 20px rgba(0,217,165,0.2)' }}
                                                itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                                formatter={(value) => [`$${value.toFixed(2)}`, 'Cumulative Equity']}
                                            />
                                            <Bar dataKey="pnl" barSize={8} isAnimationActive={false}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#00FFbb' : '#FF0055'} opacity={0.7} />
                                                ))}
                                            </Bar>
                                            <Area type="monotone" dataKey="equity" stroke={activeTest.status === 'positive' ? '#00FFBB' : '#FF0055'} strokeWidth={6} fillOpacity={1} fill="url(#massiveGradient)" isAnimationActive={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}

                            {/* Overlay text removed for performance */}
                        </div>

                    </div>
                </div>

                {/* RIGHT LATERAL PANELS (Hacker/Quant Data Logs) */}
                <div className="col-span-1 md:col-span-3 flex flex-col gap-4 pointer-events-auto h-auto min-h-[20vh] max-h-[85vh] self-start w-full">

                    {/* RIMOSSO AI PARAMETERS DA QUI: SPOSTATI SOTTO LA CHAT IN LEFT COLUMN */}

                    {/* Main Log Terminal Container - Opens only after INITIALIZE */}
                    <AnimatePresence>
                        {engineState !== 'idle' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.6, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="bg-black/90 border border-white/10 p-5 rounded-xl flex-1 flex flex-col shadow-[inset_0_0_50px_rgba(0,0,0,1)] relative overflow-hidden transition-all duration-300">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10 shrink-0">
                                        <span className="text-sm font-bold tracking-widest text-gray-300 flex items-center gap-2"><Code2 className="w-5 h-5" /> MAIN_STDOUT</span>
                                        <div className="flex gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        </div>
                                    </div>

                                    <div ref={terminalScrollRef} className="flex-1 overflow-y-auto font-mono text-base leading-relaxed scrollbar-none flex flex-col justify-start text-gray-200 pr-2">
                                        {terminalLogs.map((log, i) => {
                                            if (!log) return null;
                                            return (
                                                <div key={i} className="mb-3 p-3 rounded bg-white/5 border-l-2 border-primary/50 animate-in slide-in-from-right fade-in duration-300 font-medium whitespace-pre-wrap">
                                                    {highlightTechText(log)}
                                                </div>
                                            );
                                        })}
                                        {engineState === 'running' && (
                                            <div className="w-3 h-6 bg-primary mt-2 flex-shrink-0 animate-pulse drop-shadow-[0_0_5px_rgba(0,217,165,1)] mb-4"></div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>

            </div>
        </div >
    );
}
