import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Sparkles, Crown, Sun, Moon, Mountain, TreeDeciduous, Leaf, Sprout, Star } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const levelIcons = {
  seedling: Sprout,
  leaf: Leaf,
  tree: TreeDeciduous,
  mountain: Mountain,
  sun: Sun,
  moon: Moon,
  crown: Crown
};

export default function AscensionPage() {
  const { t } = useTranslation();
  const [ascension, setAscension] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAscension = async () => {
      try {
        const res = await axios.get(`${API}/ascension/status`);
        setAscension(res.data);
      } catch (error) {
        console.error('Error fetching ascension:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAscension();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const CurrentIcon = levelIcons[ascension?.current_level?.icon] || Star;
  const NextIcon = ascension?.next_level ? levelIcons[ascension.next_level.icon] || Star : null;

  return (
    <div className="space-y-6 fade-in" data-testid="ascension-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          Ascension Tracker
        </h1>
        <p className="text-muted-foreground mt-1">Il tuo viaggio verso l'illuminazione del trading</p>
      </motion.div>

      {/* Current Level */}
      <Card className="bg-card/80 border-border/50 overflow-hidden" data-testid="current-level">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <CardContent className="p-8 relative">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Level Badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="relative"
            >
              <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center glow">
                <CurrentIcon className="w-16 h-16 text-primary" />
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30"
              />
            </motion.div>

            {/* Level Info */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-4xl font-bold text-gradient mb-2">
                {ascension?.current_level?.name}
              </h2>
              <p className="text-xl text-muted-foreground mb-4">
                {ascension?.xp || 0} XP
              </p>

              {ascension?.next_level && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Prossimo livello: {ascension.next_level.name}</span>
                    <span className="text-primary">{Math.round(ascension.progress)}%</span>
                  </div>
                  <Progress value={ascension.progress} className="h-3" />
                  <p className="text-xs text-muted-foreground">
                    {ascension.next_level.min_xp - ascension.xp} XP rimanenti
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Levels */}
      <Card className="bg-card/80 border-border/50" data-testid="all-levels">
        <CardHeader>
          <CardTitle>Il Percorso dell'Ascensione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Progress Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />
            
            <div className="space-y-6">
              {ascension?.all_levels?.map((level, i) => {
                const LevelIcon = levelIcons[level.icon] || Star;
                const isCurrentOrPast = ascension.xp >= level.min_xp;
                const isCurrent = ascension.current_level?.name === level.name;
                
                return (
                  <motion.div
                    key={level.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`relative flex items-center gap-4 pl-4 ${
                      isCurrentOrPast ? 'opacity-100' : 'opacity-50'
                    }`}
                  >
                    {/* Level Node */}
                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                      isCurrent 
                        ? 'bg-primary text-primary-foreground glow' 
                        : isCurrentOrPast 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-secondary text-muted-foreground'
                    }`}>
                      <LevelIcon className="w-4 h-4" />
                    </div>

                    {/* Level Info */}
                    <div className={`flex-1 p-4 rounded-xl ${
                      isCurrent ? 'bg-primary/10 border border-primary' : 'bg-white/5'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`font-medium ${isCurrent ? 'text-primary' : ''}`}>
                            {level.name}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {level.min_xp} XP richiesti
                          </p>
                        </div>
                        {isCurrent && (
                          <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                            Livello Attuale
                          </span>
                        )}
                        {isCurrentOrPast && !isCurrent && (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                            Completato
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* XP Sources */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle>Come Guadagnare XP</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { action: 'Check-in Psicologia', xp: '+10 XP', icon: '🧠' },
              { action: 'Entry Journal', xp: '+15 XP', icon: '📖' },
              { action: 'Registra Trade', xp: '+5 XP', icon: '📊' },
              { action: 'Completa Strategia', xp: '+20 XP', icon: '🎯' },
              { action: '7 giorni consecutivi', xp: '+50 XP', icon: '🔥' },
              { action: 'Monte Carlo Run', xp: '+10 XP', icon: '🎲' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-4 bg-white/5 rounded-xl"
              >
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="font-medium">{item.action}</p>
                  <p className="text-sm text-primary">{item.xp}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
