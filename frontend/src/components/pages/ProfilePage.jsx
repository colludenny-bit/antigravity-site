import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, Calendar, CreditCard, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export const ProfilePage = () => {
    const { user, subscription } = useAuth();
    const navigate = useNavigate();

    const planName = subscription?.plan?.name || 'ESSENTIAL';
    const joinDate = user?.created_at
        ? new Date(user.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
        : '9 lug 2020'; // Placeholder from screenshot if not available

    return (
        <div className="max-w-4xl mx-auto pt-10 pb-20">
            {/* Header / Banner Area */}
            <div className="relative mb-20">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8">
                    {/* Large Initial Circle */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-primary/20 flex items-center justify-center border-4 border-background shadow-xl"
                    >
                        <span className="text-primary text-5xl md:text-7xl font-bold">
                            {user?.name?.charAt(0).toUpperCase()}
                        </span>
                    </motion.div>

                    <div className="flex-1 text-center md:text-left pb-2">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                                {user?.name}
                            </h1>
                            <span className="bg-white/10 text-white/70 text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest">
                                {planName}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-widest">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Online
                            </span>
                        </div>

                        <div className="flex items-center justify-center md:justify-start gap-4 text-white/40 text-sm">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                Iscritto il {joinDate}
                            </div>
                        </div>
                    </div>

                    <div className="md:pb-2">
                        <button
                            onClick={() => navigate('/app/settings')}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-sm font-semibold text-white"
                        >
                            <Settings className="w-4 h-4" />
                            Impostazioni e fatturazione
                        </button>
                    </div>
                </div>
            </div>

            {/* Profile Content - Simplified */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
                >
                    <h3 className="text-sm font-bold text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <CreditCard className="w-4 h-4" /> Abbonamento
                    </h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-lg font-bold text-white mb-1">Piano {planName}</p>
                            <p className="text-sm text-white/40">Attivato con successo</p>
                        </div>
                        <button
                            onClick={() => navigate('/pricing')}
                            className="text-primary text-xs font-bold hover:underline"
                        >
                            Cambia piano
                        </button>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
                >
                    <h3 className="text-sm font-bold text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Account
                    </h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-lg font-bold text-white mb-1">Dati personali</p>
                            <p className="text-sm text-white/40">{user?.email}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-white/20" />
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default ProfilePage;
