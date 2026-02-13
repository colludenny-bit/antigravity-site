import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { 
  BookOpen, MessageCircle, Send, Sparkles, CheckCircle2,
  TrendingUp, TrendingDown, Clock, Brain, Zap, Heart
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Mood Slider Component
const MoodSlider = ({ label, value, onChange, icon: Icon, color }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="flex items-center gap-2 text-sm">
        <Icon className={cn("w-4 h-4", color)} />
        {label}
      </Label>
      <span className="text-sm font-bold">{value}/10</span>
    </div>
    <Slider
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      max={10}
      min={1}
      step={1}
    />
  </div>
);

// AI Response Component
const AIResponse = ({ response }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-4 bg-primary/5 border border-primary/20 rounded-xl"
  >
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 space-y-3">
        {response.understood && (
          <div>
            <p className="text-xs text-primary font-medium mb-1">Ti ho capito così:</p>
            <p className="text-sm">{response.understood}</p>
          </div>
        )}
        {response.keyPoint && (
          <div>
            <p className="text-xs text-primary font-medium mb-1">Il punto chiave di oggi:</p>
            <p className="text-sm">{response.keyPoint}</p>
          </div>
        )}
        {response.wellDone && (
          <div>
            <p className="text-xs text-emerald-400 font-medium mb-1">Cosa hai fatto bene:</p>
            <p className="text-sm">{response.wellDone}</p>
          </div>
        )}
        {response.optimization && (
          <div>
            <p className="text-xs text-yellow-400 font-medium mb-1">Ottimizzazione per domani:</p>
            <p className="text-sm font-medium">{response.optimization}</p>
          </div>
        )}
      </div>
    </div>
  </motion.div>
);

// Entry Card Component
const EntryCard = ({ entry }) => (
  <Card className="bg-white/5 border-border/50">
    <CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {new Date(entry.created_at).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
        <div className="flex items-center gap-2">
          {entry.traded ? (
            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded">Traded</span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-secondary text-muted-foreground rounded">No Trade</span>
          )}
        </div>
      </div>
      <p className="text-sm line-clamp-2">{entry.freeText}</p>
      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
        <span>Mood: {entry.mood}/10</span>
        <span>•</span>
        <span>Focus: {entry.focus}/10</span>
      </div>
    </CardContent>
  </Card>
);

export default function JournalPage() {
  const [step, setStep] = useState(1);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [showExtraQuestion, setShowExtraQuestion] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    traded: null,
    mood: 5,
    focus: 5,
    stress: 5,
    energy: 5,
    freeText: '',
    mainInfluence: '',
    changeOne: '',
    extraAnswer: '',
    pnl: ''
  });

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const res = await axios.get(`${API}/journal/entries`);
      setEntries(res.data || []);
    } catch (error) {
      console.error('Error fetching entries:', error);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Save entry
      const res = await axios.post(`${API}/journal/entry`, {
        ...formData,
        created_at: new Date().toISOString()
      });
      
      // Generate AI response
      const aiRes = await axios.post(`${API}/journal/analyze`, {
        entry: formData
      });
      
      setAiResponse(aiRes.data);
      fetchEntries();
      toast.success('Entry salvata!');
    } catch (error) {
      // Generate fallback response
      setAiResponse({
        understood: `Hai avuto una giornata ${formData.mood > 6 ? 'positiva' : formData.mood < 4 ? 'difficile' : 'nella norma'}. ${formData.traded ? 'Hai tradato' : 'Non hai tradato'} e il tuo focus era a ${formData.focus}/10.`,
        keyPoint: formData.mainInfluence || 'Hai mantenuto la disciplina nonostante le sfide.',
        wellDone: formData.mood > 5 ? 'Hai gestito bene le emozioni.' : 'Hai riconosciuto i tuoi limiti oggi.',
        optimization: formData.changeOne || 'Domani, concentrati su una sola cosa: seguire il piano senza eccezioni.'
      });
      toast.success('Entry salvata!');
    } finally {
      setLoading(false);
    }
  };

  const needsExtraQuestion = () => {
    // Check for ambiguity that needs clarification
    if (!formData.traded && formData.mood < 5) return true; // No trade + low mood
    if (formData.stress > 7 && formData.traded) return true; // High stress + traded
    return false;
  };

  const getExtraQuestion = () => {
    if (!formData.traded && formData.mood < 5) {
      return "Il no-trade è stato una scelta consapevole (recupero) o evitamento (paura/frustrazione)?";
    }
    if (formData.stress > 7 && formData.traded) {
      return "Hai seguito il piano nonostante lo stress, o lo stress ti ha fatto deviare?";
    }
    return null;
  };

  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium">Hai tradato oggi?</h3>
              <p className="text-sm text-muted-foreground mt-1">Iniziamo con le basi</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={formData.traded === true ? "default" : "outline"}
                className="h-24 text-lg"
                onClick={() => { setFormData({...formData, traded: true}); setStep(2); }}
              >
                <TrendingUp className="w-6 h-6 mr-2" />
                Sì
              </Button>
              <Button
                variant={formData.traded === false ? "default" : "outline"}
                className="h-24 text-lg"
                onClick={() => { setFormData({...formData, traded: false}); setStep(2); }}
              >
                <Clock className="w-6 h-6 mr-2" />
                No
              </Button>
            </div>
          </motion.div>
        );
      
      case 2:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium">Come ti sei sentito oggi?</h3>
              <p className="text-sm text-muted-foreground">Valutazione rapida 1-10</p>
            </div>
            
            <div className="space-y-4">
              <MoodSlider 
                label="Mood" value={formData.mood} 
                onChange={(v) => setFormData({...formData, mood: v})}
                icon={Heart} color="text-pink-400"
              />
              <MoodSlider 
                label="Focus" value={formData.focus}
                onChange={(v) => setFormData({...formData, focus: v})}
                icon={Brain} color="text-purple-400"
              />
              <MoodSlider 
                label="Stress" value={formData.stress}
                onChange={(v) => setFormData({...formData, stress: v})}
                icon={Zap} color="text-yellow-400"
              />
              <MoodSlider 
                label="Energia" value={formData.energy}
                onChange={(v) => setFormData({...formData, energy: v})}
                icon={TrendingUp} color="text-emerald-400"
              />
            </div>

            <Button onClick={() => setStep(3)} className="w-full">
              Continua
            </Button>
          </motion.div>
        );

      case 3:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">
                  Racconta la tua giornata (anche 2 righe vanno bene)
                </Label>
                <Textarea
                  value={formData.freeText}
                  onChange={(e) => setFormData({...formData, freeText: e.target.value})}
                  placeholder="Come è andata oggi? Cosa è successo di rilevante?"
                  className="min-h-[100px]"
                />
              </div>

              {formData.traded && (
                <div>
                  <Label className="text-sm mb-2 block">PnL del giorno (opzionale)</Label>
                  <input
                    type="text"
                    value={formData.pnl}
                    onChange={(e) => setFormData({...formData, pnl: e.target.value})}
                    placeholder="Es: +2R, -$150, BE"
                    className="w-full p-2 bg-white/5 border border-border rounded-lg"
                  />
                </div>
              )}
            </div>

            <Button onClick={() => setStep(4)} className="w-full" disabled={!formData.freeText}>
              Continua
            </Button>
          </motion.div>
        );

      case 4:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium">2 domande essenziali</h3>
              <p className="text-sm text-muted-foreground">Poi Karion ti darà il suo feedback</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">
                  1. Qual è stata la cosa più importante che ha influenzato la tua giornata?
                </Label>
                <Textarea
                  value={formData.mainInfluence}
                  onChange={(e) => setFormData({...formData, mainInfluence: e.target.value})}
                  placeholder="Mercato, regole, energia, emozioni..."
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label className="text-sm mb-2 block">
                  2. Se potessi cambiare una sola cosa oggi, quale sarebbe?
                </Label>
                <Textarea
                  value={formData.changeOne}
                  onChange={(e) => setFormData({...formData, changeOne: e.target.value})}
                  placeholder="Una cosa pratica e specifica..."
                  className="min-h-[80px]"
                />
              </div>
            </div>

            <Button 
              onClick={() => {
                if (needsExtraQuestion()) {
                  setShowExtraQuestion(true);
                  setStep(5);
                } else {
                  handleSubmit();
                  setStep(6);
                }
              }} 
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Analizzando...' : 'Ottieni Feedback'}
            </Button>
          </motion.div>
        );

      case 5:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-4">
              <h3 className="text-lg font-medium">Un ultimo chiarimento</h3>
              <p className="text-sm text-muted-foreground">Per darti un feedback più preciso</p>
            </div>

            <div>
              <Label className="text-sm mb-2 block">{getExtraQuestion()}</Label>
              <Textarea
                value={formData.extraAnswer}
                onChange={(e) => setFormData({...formData, extraAnswer: e.target.value})}
                placeholder="La tua risposta..."
                className="min-h-[100px]"
              />
            </div>

            <Button 
              onClick={() => { handleSubmit(); setStep(6); }} 
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Analizzando...' : 'Ottieni Feedback'}
            </Button>
          </motion.div>
        );

      case 6:
        return (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="text-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-2" />
              <h3 className="text-lg font-medium">Entry Salvata!</h3>
            </div>

            {aiResponse && <AIResponse response={aiResponse} />}

            <Button 
              onClick={() => {
                setStep(1);
                setFormData({
                  traded: null, mood: 5, focus: 5, stress: 5, energy: 5,
                  freeText: '', mainInfluence: '', changeOne: '', extraAnswer: '', pnl: ''
                });
                setAiResponse(null);
              }} 
              variant="outline"
              className="w-full"
            >
              Nuova Entry
            </Button>
          </motion.div>
        );
    }
  };

  return (
    <div className="space-y-6 fade-in" data-testid="journal-page">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          Trading Journal
        </h1>
        <p className="text-muted-foreground mt-1">
          Dialogo minimo, massimo insight • Il tuo coach-amico
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Journal Form */}
        <Card className="lg:col-span-2 bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                Journal di Oggi
              </span>
              <span className="text-xs text-muted-foreground">
                Step {step}/6
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Progress Bar */}
            <div className="h-1 bg-secondary rounded-full mb-6 overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${(step / 6) * 100}%` }}
              />
            </div>

            {renderStep()}
          </CardContent>
        </Card>

        {/* Recent Entries */}
        <Card className="bg-card/80 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Entries Recenti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
            {entries.length > 0 ? (
              entries.slice(0, 7).map((entry, i) => (
                <EntryCard key={entry._id || i} entry={entry} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nessuna entry ancora. Inizia il tuo journal!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
