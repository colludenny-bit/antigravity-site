import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { MarketService } from '../services/MarketService';
import { AIService } from '../services/AIService';

const MarketContext = createContext();
const FOREGROUND_POLL_MS = 12000;
const BACKGROUND_POLL_MS = 30000;

export const useMarket = () => useContext(MarketContext);

// Dynamic News Generator
const generateNews = () => {
    const events = [
        { title: "Fed Speaker Daly: Rates might stay higher", impact: "High", sentiment: "Bearish", currency: "USD" },
        { title: "Tech Sector Rally extends into close", impact: "Medium", sentiment: "Bullish", currency: "USD" },
        { title: "Oil prices drop on inventory buildup", impact: "Medium", sentiment: "Bearish", currency: "USD" },
        { title: "Gold breaks resistance at 2750", impact: "High", sentiment: "Bullish", currency: "USD" },
        { title: "ECB warns on sticky services inflation", impact: "Low", sentiment: "Bearish", currency: "EUR" },
        { title: "NVIDIA announces new AI chip partnership", impact: "High", sentiment: "Bullish", currency: "USD" },
        { title: "JPMorgan sees S&P 500 reaching 6200", impact: "Medium", sentiment: "Bullish", currency: "USD" },
        { title: "US Treasury Yields tick higher", impact: "Medium", sentiment: "Bearish", currency: "USD" },
        { title: "Bitcoin reclaims $95k support level", impact: "High", sentiment: "Bullish", currency: "USD" },
        { title: "Apple services revenue beats expectations", impact: "Medium", sentiment: "Bullish", currency: "USD" }
    ];
    const item = events[Math.floor(Math.random() * events.length)];
    return {
        ...item,
        id: Date.now() + Math.random(),
        title: `${item.title} [Updated]`
    };
};

export const MarketProvider = ({ children }) => {
    const [marketData, setMarketData] = useState({
        crypto: null,
        macro: null,
        news: [],
        loading: true
    });
    const [aiPulse, setAiPulse] = useState(null);

    // Ref to hold latest data for the independent AI loop
    const marketDataRef = useRef(marketData);
    const fetchInFlightRef = useRef(false);
    const pollTimerRef = useRef(null);

    // Update ref whenever state changes
    useEffect(() => {
        marketDataRef.current = marketData;
    }, [marketData]);

    const mapPricesToMacro = (prices, previousMacro) => {
        if (!prices || typeof prices !== 'object') return previousMacro;

        return {
            ...(previousMacro || {}),
            ...(prices.SP500 ? { SPX: { price: prices.SP500.price, change: prices.SP500.change, name: 'S&P 500' } } : {}),
            ...(prices.NAS100 ? { NDX: { price: prices.NAS100.price, change: prices.NAS100.change, name: 'NASDAQ 100' } } : {}),
            ...(prices.XAUUSD ? { XAU: { price: prices.XAUUSD.price, change: prices.XAUUSD.change, name: 'Gold' } } : {}),
            ...(prices.VIX ? { VIX: { price: prices.VIX.price, change: prices.VIX.change, name: 'Volatility' } } : {}),
            ...(prices.DXY ? { DXY: { price: prices.DXY.price, change: prices.DXY.change, name: 'Dollar Index' } } : {})
        };
    };

    // 1. Market loop with dedupe + backpressure (no overlapping requests)
    useEffect(() => {
        let cancelled = false;

        // Seed initials news
        const now = new Date();
        const initialNews = Array(5).fill(0).map((_, i) => ({
            ...generateNews(),
            time: new Date(now - i * 60000 * 5).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        }));

        setMarketData(prev => ({ ...prev, news: initialNews }));

        const fetchAllData = async () => {
            if (cancelled || fetchInFlightRef.current) return;
            fetchInFlightRef.current = true;
            try {
                const fetchSafe = async (fn, fallback) => {
                    try { return await fn(); }
                    catch (e) { console.warn("API Fail:", e); return fallback; }
                };

                const crypto = await fetchSafe(MarketService.getPrices, marketDataRef.current.crypto);
                const macro = mapPricesToMacro(crypto, marketDataRef.current.macro);

                setMarketData(prev => ({
                    ...prev,
                    crypto: crypto || prev.crypto,
                    macro: macro || prev.macro,
                    loading: false
                }));
            } catch (error) {
                console.error("Global Data Loop Error", error);
                setMarketData(prev => ({ ...prev, loading: false }));
            } finally {
                fetchInFlightRef.current = false;
                if (!cancelled) {
                    const nextDelay = document.hidden ? BACKGROUND_POLL_MS : FOREGROUND_POLL_MS;
                    pollTimerRef.current = setTimeout(fetchAllData, nextDelay);
                }
            }
        };

        fetchAllData();
        return () => {
            cancelled = true;
            if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        };
    }, []);

    // 2. AI & Fast News Loop (Independent Interval)
    useEffect(() => {
        const aiLoop = async () => {
            if (document.hidden) return;
            const currentData = marketDataRef.current; // Access fresh data from Ref

            // A. Generate News (throttled on low-power/mobile devices)
            if (Math.random() > 0.75) {
                const newNews = {
                    ...generateNews(),
                    time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                };

                setMarketData(prev => ({
                    ...prev,
                    news: [newNews, ...(prev.news || []).slice(0, 49)]
                }));
            }

            // B. AI Insight Pulse (Every 60s roughly)
            if (Math.random() > 0.8) {
                const keys = JSON.parse(localStorage.getItem('karion_api_keys') || '{}');
                const contextData = {
                    context: "Global Pulse",
                    spx: currentData.macro?.SPX || { change: 0 },
                    btc: currentData.crypto?.bitcoin || { usd_24h_change: 0 }
                };

                try {
                    // Don't block UI with await if possible, but here we need result
                    const analysis = await AIService.analyzeMarket(contextData, keys.openai);

                    if (analysis) {
                        setAiPulse(analysis);
                        // toast(
                        //     <div className="space-y-1">
                        //         <p className="font-bold text-xs text-primary flex items-center gap-1">
                        //             🧠 Karion AI Insight
                        //         </p>
                        //         <p className="text-xs leading-tight">{analysis.text.substring(0, 80)}...</p>
                        //     </div>,
                        //     { duration: 5000, position: 'top-right' }
                        // );
                    }
                } catch (e) { console.warn("AI Pulse skipped"); }
            }
        };

        // Run interval independently of state changes
        const interval = setInterval(aiLoop, 30000);
        return () => clearInterval(interval);
    }, []); // Empty dependency array = stable interval

    return (
        <MarketContext.Provider value={{ marketData, aiPulse }}>
            {children}
        </MarketContext.Provider>
    );
};
