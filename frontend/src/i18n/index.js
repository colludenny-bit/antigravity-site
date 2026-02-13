import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  it: {
    translation: {
      // Navigation
      "nav.home": "Home",
      "nav.strategy": "Strategia",
      "nav.charts": "Grafici",
      "nav.psychology": "Psicologia",
      "nav.journal": "Diario",
      "nav.community": "Community",
      "nav.ai": "AI Centrale",
      "nav.montecarlo": "Monte Carlo",
      "nav.statistics": "Statistiche",
      "nav.ascension": "Ascensione",
      "nav.settings": "Impostazioni",
      "nav.logout": "Esci",
      
      // Greetings
      "greeting.morning": "Buongiorno",
      "greeting.afternoon": "Buon pomeriggio",
      "greeting.evening": "Buonasera",
      "greeting.night": "Buonanotte",
      
      // Dashboard
      "dashboard.assistant_active": "Trading assistant attivo",
      "dashboard.market_overview": "AI Macro Desk",
      "dashboard.live_activity": "Attività Live",
      "dashboard.view_all": "Vedi Tutto",
      "dashboard.pre_market": "Pre-Mercato",
      "dashboard.market_opens": "Mercato apre tra",
      
      // Market
      "market.bullish": "Rialzista",
      "market.bearish": "Ribassista",
      "market.neutral": "Neutrale",
      "market.confidence": "Confidenza",
      "market.win_rate": "Win Rate",
      "market.max_dd": "Max DD",
      
      // Psychology
      "psychology.title": "Psicologia Trading",
      "psychology.checkin": "Check-in Giornaliero",
      "psychology.confidence": "Confidenza",
      "psychology.discipline": "Disciplina",
      "psychology.emotions": "Stato Emotivo",
      "psychology.sleep_hours": "Ore Sonno",
      "psychology.sleep_quality": "Qualità Sonno",
      "psychology.rules": "Regole & Disciplina",
      "psychology.stats": "Statistiche",
      "psychology.avg_confidence": "Media Confidenza",
      "psychology.avg_discipline": "Media Disciplina",
      "psychology.total_entries": "Entries Totali",
      
      // Journal
      "journal.title": "Diario Trading",
      "journal.errors": "Errori Oggi",
      "journal.lessons": "Lezioni Apprese",
      "journal.plan_respected": "Piano rispettato?",
      "journal.emotions": "Come ti sei sentito?",
      "journal.lucid": "Eri lucido?",
      "journal.optimize": "Cosa ottimizzare?",
      "journal.ai_suggestions": "Consigli AI",
      
      // Strategy
      "strategy.title": "La Tua Strategia",
      "strategy.optimize": "Ottimizza con AI",
      "strategy.save": "Salva Strategia",
      "strategy.name": "Nome Strategia",
      "strategy.content": "Descrivi la tua strategia...",
      
      // Community
      "community.title": "Community",
      "community.share": "Condividi Trade",
      "community.winners": "Solo Winners",
      
      // AI
      "ai.title": "AI Centrale Suprema",
      "ai.risk": "Risk Calculator",
      "ai.montecarlo": "Monte Carlo",
      "ai.performance": "Performance",
      "ai.mt5": "MT5 Analysis",
      "ai.psychology": "Psicologia",
      "ai.analysis": "Analisi Tecnica",
      "ai.coach": "AI Coach",
      "ai.signals": "Neural Signals",
      
      // Monte Carlo
      "montecarlo.title": "Simulazione Monte Carlo",
      "montecarlo.win_rate": "Win Rate (%)",
      "montecarlo.avg_win": "Media Win (R)",
      "montecarlo.avg_loss": "Media Loss (R)",
      "montecarlo.num_trades": "Numero Trade",
      "montecarlo.initial_capital": "Capitale Iniziale",
      "montecarlo.risk_per_trade": "Rischio per Trade (%)",
      "montecarlo.simulate": "Simula 10,000 Trade",
      "montecarlo.bankruptcy": "Rischio Bancarotta",
      
      // Settings
      "settings.title": "Impostazioni",
      "settings.theme": "Tema",
      "settings.language": "Lingua",
      "settings.dark": "Scuro",
      "settings.light": "Chiaro",
      
      // Auth
      "auth.login": "Accedi",
      "auth.register": "Registrati",
      "auth.email": "Email",
      "auth.password": "Password",
      "auth.name": "Nome",
      "auth.no_account": "Non hai un account?",
      "auth.has_account": "Hai già un account?",
      
      // Common
      "common.save": "Salva",
      "common.cancel": "Annulla",
      "common.submit": "Invia",
      "common.loading": "Caricamento...",
      "common.error": "Errore",
      "common.success": "Successo"
    }
  },
  en: {
    translation: {
      // Navigation
      "nav.home": "Home",
      "nav.strategy": "Strategy",
      "nav.charts": "Charts",
      "nav.psychology": "Psychology",
      "nav.journal": "Journal",
      "nav.community": "Community",
      "nav.ai": "AI Central",
      "nav.montecarlo": "Monte Carlo",
      "nav.statistics": "Statistics",
      "nav.ascension": "Ascension",
      "nav.settings": "Settings",
      "nav.logout": "Logout",
      
      // Greetings
      "greeting.morning": "Good morning",
      "greeting.afternoon": "Good afternoon",
      "greeting.evening": "Good evening",
      "greeting.night": "Good night",
      
      // Dashboard
      "dashboard.assistant_active": "Trading assistant active",
      "dashboard.market_overview": "AI Macro Desk",
      "dashboard.live_activity": "Live Activity",
      "dashboard.view_all": "View All",
      "dashboard.pre_market": "Pre-Market",
      "dashboard.market_opens": "Market opens in",
      
      // Market
      "market.bullish": "Bullish",
      "market.bearish": "Bearish",
      "market.neutral": "Neutral",
      "market.confidence": "Confidence",
      "market.win_rate": "Win Rate",
      "market.max_dd": "Max DD",
      
      // Psychology
      "psychology.title": "Trading Psychology",
      "psychology.checkin": "Daily Check-in",
      "psychology.confidence": "Confidence",
      "psychology.discipline": "Discipline",
      "psychology.emotions": "Emotional State",
      "psychology.sleep_hours": "Sleep Hours",
      "psychology.sleep_quality": "Sleep Quality",
      "psychology.rules": "Rules & Discipline",
      "psychology.stats": "Statistics",
      "psychology.avg_confidence": "Avg Confidence",
      "psychology.avg_discipline": "Avg Discipline",
      "psychology.total_entries": "Total Entries",
      
      // Journal
      "journal.title": "Trading Journal",
      "journal.errors": "Today's Errors",
      "journal.lessons": "Lessons Learned",
      "journal.plan_respected": "Plan respected?",
      "journal.emotions": "How did you feel?",
      "journal.lucid": "Were you lucid?",
      "journal.optimize": "What to optimize?",
      "journal.ai_suggestions": "AI Suggestions",
      
      // Strategy
      "strategy.title": "Your Strategy",
      "strategy.optimize": "Optimize with AI",
      "strategy.save": "Save Strategy",
      "strategy.name": "Strategy Name",
      "strategy.content": "Describe your strategy...",
      
      // Community
      "community.title": "Community",
      "community.share": "Share Trade",
      "community.winners": "Winners Only",
      
      // AI
      "ai.title": "AI Central Supreme",
      "ai.risk": "Risk Calculator",
      "ai.montecarlo": "Monte Carlo",
      "ai.performance": "Performance",
      "ai.mt5": "MT5 Analysis",
      "ai.psychology": "Psychology",
      "ai.analysis": "Technical Analysis",
      "ai.coach": "AI Coach",
      "ai.signals": "Neural Signals",
      
      // Monte Carlo
      "montecarlo.title": "Monte Carlo Simulation",
      "montecarlo.win_rate": "Win Rate (%)",
      "montecarlo.avg_win": "Avg Win (R)",
      "montecarlo.avg_loss": "Avg Loss (R)",
      "montecarlo.num_trades": "Number of Trades",
      "montecarlo.initial_capital": "Initial Capital",
      "montecarlo.risk_per_trade": "Risk per Trade (%)",
      "montecarlo.simulate": "Simulate 10,000 Trades",
      "montecarlo.bankruptcy": "Bankruptcy Risk",
      
      // Settings
      "settings.title": "Settings",
      "settings.theme": "Theme",
      "settings.language": "Language",
      "settings.dark": "Dark",
      "settings.light": "Light",
      
      // Auth
      "auth.login": "Login",
      "auth.register": "Register",
      "auth.email": "Email",
      "auth.password": "Password",
      "auth.name": "Name",
      "auth.no_account": "Don't have an account?",
      "auth.has_account": "Already have an account?",
      
      // Common
      "common.save": "Save",
      "common.cancel": "Cancel",
      "common.submit": "Submit",
      "common.loading": "Loading...",
      "common.error": "Error",
      "common.success": "Success"
    }
  },
  fr: {
    translation: {
      // Navigation
      "nav.home": "Accueil",
      "nav.strategy": "Stratégie",
      "nav.charts": "Graphiques",
      "nav.psychology": "Psychologie",
      "nav.journal": "Journal",
      "nav.community": "Communauté",
      "nav.ai": "AI Central",
      "nav.montecarlo": "Monte Carlo",
      "nav.statistics": "Statistiques",
      "nav.ascension": "Ascension",
      "nav.settings": "Paramètres",
      "nav.logout": "Déconnexion",
      
      // Greetings
      "greeting.morning": "Bonjour",
      "greeting.afternoon": "Bon après-midi",
      "greeting.evening": "Bonsoir",
      "greeting.night": "Bonne nuit",
      
      // Dashboard
      "dashboard.assistant_active": "Assistant trading actif",
      "dashboard.market_overview": "AI Macro Desk",
      "dashboard.live_activity": "Activité en Direct",
      "dashboard.view_all": "Voir Tout",
      "dashboard.pre_market": "Pré-Marché",
      "dashboard.market_opens": "Marché ouvre dans",
      
      // Market
      "market.bullish": "Haussier",
      "market.bearish": "Baissier",
      "market.neutral": "Neutre",
      "market.confidence": "Confiance",
      "market.win_rate": "Taux de Réussite",
      "market.max_dd": "DD Max",
      
      // Psychology
      "psychology.title": "Psychologie Trading",
      "psychology.checkin": "Check-in Quotidien",
      "psychology.confidence": "Confiance",
      "psychology.discipline": "Discipline",
      "psychology.emotions": "État Émotionnel",
      "psychology.sleep_hours": "Heures de Sommeil",
      "psychology.sleep_quality": "Qualité du Sommeil",
      "psychology.rules": "Règles & Discipline",
      "psychology.stats": "Statistiques",
      "psychology.avg_confidence": "Confiance Moyenne",
      "psychology.avg_discipline": "Discipline Moyenne",
      "psychology.total_entries": "Entrées Totales",
      
      // Journal
      "journal.title": "Journal de Trading",
      "journal.errors": "Erreurs du Jour",
      "journal.lessons": "Leçons Apprises",
      "journal.plan_respected": "Plan respecté?",
      "journal.emotions": "Comment vous êtes-vous senti?",
      "journal.lucid": "Étiez-vous lucide?",
      "journal.optimize": "Quoi optimiser?",
      "journal.ai_suggestions": "Suggestions AI",
      
      // Strategy
      "strategy.title": "Votre Stratégie",
      "strategy.optimize": "Optimiser avec AI",
      "strategy.save": "Sauvegarder",
      "strategy.name": "Nom de la Stratégie",
      "strategy.content": "Décrivez votre stratégie...",
      
      // Community
      "community.title": "Communauté",
      "community.share": "Partager Trade",
      "community.winners": "Gagnants Uniquement",
      
      // AI
      "ai.title": "AI Central Suprême",
      "ai.risk": "Calculateur de Risque",
      "ai.montecarlo": "Monte Carlo",
      "ai.performance": "Performance",
      "ai.mt5": "Analyse MT5",
      "ai.psychology": "Psychologie",
      "ai.analysis": "Analyse Technique",
      "ai.coach": "Coach AI",
      "ai.signals": "Signaux Neuronaux",
      
      // Monte Carlo
      "montecarlo.title": "Simulation Monte Carlo",
      "montecarlo.win_rate": "Taux de Réussite (%)",
      "montecarlo.avg_win": "Gain Moyen (R)",
      "montecarlo.avg_loss": "Perte Moyenne (R)",
      "montecarlo.num_trades": "Nombre de Trades",
      "montecarlo.initial_capital": "Capital Initial",
      "montecarlo.risk_per_trade": "Risque par Trade (%)",
      "montecarlo.simulate": "Simuler 10,000 Trades",
      "montecarlo.bankruptcy": "Risque de Faillite",
      
      // Settings
      "settings.title": "Paramètres",
      "settings.theme": "Thème",
      "settings.language": "Langue",
      "settings.dark": "Sombre",
      "settings.light": "Clair",
      
      // Auth
      "auth.login": "Connexion",
      "auth.register": "Inscription",
      "auth.email": "Email",
      "auth.password": "Mot de passe",
      "auth.name": "Nom",
      "auth.no_account": "Pas de compte?",
      "auth.has_account": "Déjà un compte?",
      
      // Common
      "common.save": "Sauvegarder",
      "common.cancel": "Annuler",
      "common.submit": "Envoyer",
      "common.loading": "Chargement...",
      "common.error": "Erreur",
      "common.success": "Succès"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'it',
    fallbackLng: 'it',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
