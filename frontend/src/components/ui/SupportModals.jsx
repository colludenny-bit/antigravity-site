import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './button';
import { Input } from './input';
import { Card } from './card';
import {
    X, Search, MessageSquare, BookOpen, ExternalLink,
    Gift, Copy, Check, Sparkles, Zap, Shield, Heart, Mail
} from 'lucide-react';
import { toast } from 'sonner';

const ModalWrapper = ({ isOpen, onClose, title, children, icon: Icon }) => (
    <AnimatePresence>
        {isOpen && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 font-apple"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="bg-zinc-950 border border-white/10 rounded-[32px] max-w-lg w-full overflow-hidden shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                {Icon && (
                                    <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                                        <Icon className="w-5 h-5 text-white/60" />
                                    </div>
                                )}
                                <h3 className="text-2xl font-black text-white tracking-tight">{title}</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5 text-white/40" />
                            </button>
                        </div>
                        {children}
                    </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

export const SupportModal = ({ isOpen, onClose }) => {
    const [search, setSearch] = useState('');
    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title="Supporto" icon={MessageSquare}>
            <div className="space-y-6">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <Input
                        placeholder="Cerca una soluzione..."
                        className="pl-11 h-12 rounded-2xl bg-white/5 border-white/10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {[
                        { label: 'Guida rapida', icon: Zap, desc: 'Impara le basi in 5 minuti' },
                        { label: 'Documentazione API', icon: BookOpen, desc: 'Per sviluppatori e tecnofili' },
                        { label: 'Sicurezza Account', icon: Shield, desc: 'Come proteggere i tuoi dati' },
                    ].map((link, i) => (
                        <button key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.05] transition-all text-left">
                            <div className="flex items-center gap-4">
                                <link.icon className="w-5 h-5 text-[#00D9A5]" />
                                <div>
                                    <div className="font-bold text-white text-sm">{link.label}</div>
                                    <div className="text-white/40 text-xs">{link.desc}</div>
                                </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-white/20" />
                        </button>
                    ))}
                </div>

                <Button className="w-full h-14 rounded-2xl bg-[#00D9A5] hover:bg-[#00D9A5]/90 text-black font-black text-lg">
                    Parla con un esperto
                </Button>
            </div>
        </ModalWrapper>
    );
};

export const WhatsNewModal = ({ isOpen, onClose }) => (
    <ModalWrapper isOpen={isOpen} onClose={onClose} title="Novità" icon={Sparkles}>
        <div className="space-y-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {[
                {
                    tag: 'NUOVO',
                    date: '15 Febbraio 2026',
                    title: 'Motore Multi-Sorgente v2',
                    desc: 'Abbiamo ottimizzato l\'engine per fornire aggiornamenti live ogni 30 secondi con driver più precisi.'
                },
                {
                    tag: 'UPDATE',
                    date: '10 Febbraio 2026',
                    title: 'Dashboard Refresh',
                    desc: 'Nuovo design per le impostazioni e la gestione abbonamenti, ora più veloce e intuitivo.'
                },
                {
                    tag: 'FEATURE',
                    date: '5 Febbraio 2026',
                    title: 'COT Seasonality Insight',
                    desc: 'Analizza i pattern stagionali degli istituzionali direttamente nello screening.'
                }
            ].map((news, i) => (
                <div key={i} className="relative pl-6 border-l border-white/10 pb-8 last:pb-0">
                    <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-[#00D9A5] shadow-[0_0_10px_rgba(0,217,165,0.5)]" />
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-black bg-[#00D9A5]/10 text-[#00D9A5] px-2 py-0.5 rounded-full tracking-widest uppercase">
                            {news.tag}
                        </span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                            {news.date}
                        </span>
                    </div>
                    <h4 className="font-bold text-white mb-2">{news.title}</h4>
                    <p className="text-white/40 text-sm font-medium leading-relaxed">
                        {news.desc}
                    </p>
                </div>
            ))}
        </div>
    </ModalWrapper>
);

export const InviteFriendModal = ({ isOpen, onClose }) => {
    const referralLink = "karion.io/join/denny-77";
    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink);
        toast.success('Link copiato negli appunti!');
    };

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title="Invita un amico" icon={Heart}>
            <div className="space-y-8">
                <div className="text-center bg-white/5 rounded-3xl p-8 border border-white/10">
                    <Gift className="w-12 h-12 text-[#00D9A5] mx-auto mb-4 animate-bounce" />
                    <h4 className="text-xl font-bold text-white mb-2">Regala Karion, ricevi bonus</h4>
                    <p className="text-white/40 text-sm font-medium">
                        Per ogni amico che si abbona usando il tuo link, riceverete entrambi 15€ di credito Karion.
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest px-2">Il tuo link personale</label>
                    <div className="flex gap-2">
                        <div className="flex-1 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center px-6 font-mono text-white/60">
                            {referralLink}
                        </div>
                        <Button onClick={handleCopy} className="h-14 w-14 rounded-2xl bg-white/10 hover:bg-white/15 p-0">
                            <Copy className="w-5 h-5 text-white" />
                        </Button>
                    </div>
                </div>

                <div className="flex justify-center gap-4 text-white/20">
                    {/* Mock Social Icons */}
                    <button className="hover:text-white transition-colors"><MessageSquare className="w-6 h-6" /></button>
                    <button className="hover:text-white transition-colors"><ExternalLink className="w-6 h-6" /></button>
                    <button className="hover:text-white transition-colors"><Mail className="w-6 h-6" /></button>
                </div>
            </div>
        </ModalWrapper>
    );
};
