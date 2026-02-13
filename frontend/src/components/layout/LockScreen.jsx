import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowRight, ShieldCheck } from 'lucide-react';

const ACCESS_CODE = "karion2024"; // Simple access code

export const LockScreen = ({ onUnlock }) => {
    const [input, setInput] = useState('');
    const [error, setError] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);

    useEffect(() => {
        // Check local storage for previous session
        const savedSession = localStorage.getItem('karion_access');
        if (savedSession === 'granted') {
            onUnlock();
        }
    }, [onUnlock]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input === ACCESS_CODE) {
            setIsUnlocked(true);
            localStorage.setItem('karion_access', 'granted');
            setTimeout(() => {
                onUnlock();
            }, 800);
        } else {
            setError(true);
            setTimeout(() => setError(false), 500);
            setInput('');
        }
    };

    return (
        <div className="fixed inset-0 bg-[#050505] z-[9999] flex items-center justify-center p-4">
            {/* Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#00D9A5]/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-[#00D9A5]/5 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-md"
            >
                <div className="bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-col items-center text-center mb-8">
                        <motion.div
                            animate={isUnlocked ? { scale: [1, 1.2, 0], opacity: 0 } : {}}
                            className="w-16 h-16 bg-[#00D9A5]/10 rounded-2xl flex items-center justify-center mb-4 border border-[#00D9A5]/20"
                        >
                            {isUnlocked ? (
                                <ShieldCheck className="w-8 h-8 text-[#00D9A5]" />
                            ) : (
                                <Lock className="w-8 h-8 text-[#00D9A5]" />
                            )}
                        </motion.div>

                        <h1 className="text-2xl font-bold text-white mb-2">Karion Beta 1</h1>
                        <p className="text-white/40 text-sm">Accesso Riservato</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <input
                                type="password"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Inserisci Codice Accesso"
                                className={`w-full bg-black/40 border ${error ? 'border-red-500/50' : 'border-white/10 focus:border-[#00D9A5]/50'} rounded-xl px-4 py-3.5 text-center text-white placeholder-white/20 outline-none transition-all duration-300 font-mono tracking-widest text-lg`}
                                autoFocus
                            />
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-[#00D9A5] hover:bg-[#00D9A5]/90 text-black font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                            disabled={isUnlocked}
                        >
                            {isUnlocked ? 'Accesso Consentito...' : 'Entra nel Sistema'}
                            {!isUnlocked && <ArrowRight className="w-4 h-4" />}
                        </motion.button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">Protected Environment</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
