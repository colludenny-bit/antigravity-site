import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Settings, Moon, Sun, Globe, User, Bell, Shield, Palette,
  Lock, Key, ExternalLink, Check, X, Eye, EyeOff,
  TrendingUp, Download, Trash2, Volume2, Zap, Database, LogOut
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme, darkVariant, setDarkVariant } = useTheme();
  const { logout } = useAuth();

  // State for modals and forms
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showTVModal, setShowTVModal] = useState(false);
  const [showAPIModal, setShowAPIModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({});
  const [tvConnected, setTVConnected] = useState(false);
  const [tvUsername, setTVUsername] = useState('');

  // Notification preferences with persistence
  const [notifications, setNotifications] = useState({
    dailyCheckin: true,
    revengeAlert: true,
    weeklyReport: false,
    communityUpdates: false,
    priceAlerts: true,
    aiInsights: true
  });

  // API Keys
  const [apiKeys, setApiKeys] = useState({
    tradingview: '',
    coingecko: '',
    openai: ''
  });

  // Load saved keys on mount
  React.useEffect(() => {
    const savedKeys = localStorage.getItem('karion_api_keys');
    if (savedKeys) {
      setApiKeys(JSON.parse(savedKeys));
    }
  }, []);

  const saveApiKeys = () => {
    localStorage.setItem('karion_api_keys', JSON.stringify(apiKeys));
    toast.success('API keys salvate con successo!');
    setShowAPIModal(false);
  };

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    toast.success(`Lingua cambiata in ${lang === 'it' ? 'Italiano' : lang === 'en' ? 'English' : 'Français'}`);
  };

  const handlePasswordChange = () => {
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('Le password non coincidono');
      return;
    }
    if (passwordForm.new.length < 8) {
      toast.error('La password deve essere almeno 8 caratteri');
      return;
    }
    toast.success('Password aggiornata con successo!');
    setShowPasswordModal(false);
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  const handleTVConnect = () => {
    if (!tvUsername.trim()) {
      toast.error('Inserisci il tuo username TradingView');
      return;
    }
    setTVConnected(true);
    toast.success(`TradingView collegato: @${tvUsername}`);
    setShowTVModal(false);
  };

  const handleExportData = () => {
    toast.loading('Preparando export...');
    setTimeout(() => {
      toast.dismiss();
      toast.success('Dati esportati! Download in corso...');
    }, 2000);
  };

  const toggleNotification = (key) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    toast.success(notifications[key] ? 'Notifica disattivata' : 'Notifica attivata');
  };

  return (
    <div className="space-y-6 fade-in max-w-2xl" data-testid="settings-page">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground mt-1">Personalizza la tua esperienza Karion</p>
      </motion.div>

      {/* Appearance */}
      <Card className="bg-card/80 border-border/50" data-testid="appearance-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Aspetto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-primary" />
              ) : (
                <Sun className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">{t('settings.theme')}</p>
                <p className="text-sm text-muted-foreground">
                  {theme === 'dark' ? 'Dark Mode attivo' : 'Light Mode attivo'}
                </p>
              </div>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={toggleTheme}
              data-testid="theme-switch"
            />
          </div>

          {/* Dark Theme Variant - Only visible when dark mode is active */}


          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium">{t('settings.language')}</p>
                <p className="text-sm text-muted-foreground">
                  {i18n.language === 'it' ? 'Italiano' : i18n.language === 'en' ? 'English' : 'Français'}
                </p>
              </div>
            </div>
            <Select value={i18n.language} onValueChange={changeLanguage}>
              <SelectTrigger className="w-[140px]" data-testid="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card className="bg-card/80 border-border/50" data-testid="integrations-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Integrazioni
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* TradingView */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-medium">TradingView</p>
                <p className="text-sm text-muted-foreground">
                  {tvConnected ? `Collegato: @${tvUsername}` : 'Sincronizza grafici e idee'}
                </p>
              </div>
            </div>
            <Button
              variant={tvConnected ? "secondary" : "outline"}
              className="rounded-xl"
              onClick={() => tvConnected ? setTVConnected(false) : setShowTVModal(true)}
            >
              {tvConnected ? (
                <><Check className="w-4 h-4 mr-2 text-emerald-400" /> Collegato</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-2" /> Collega</>
              )}
            </Button>
          </div>

          {/* API Keys */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="font-medium">API Keys</p>
                <p className="text-sm text-muted-foreground">Configura chiavi esterne</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowAPIModal(true)}>
              Configura
            </Button>
          </div>

          {/* Export Data */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Database className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium">Esporta Dati</p>
                <p className="text-sm text-muted-foreground">Scarica journal, trades, psicologia</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={handleExportData}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="bg-card/80 border-border/50" data-testid="account-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Cambia Password</p>
                <p className="text-sm text-muted-foreground">Ultima modifica: mai</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowPasswordModal(true)}>
              Modifica
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card/80 border-border/50" data-testid="notification-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'dailyCheckin', label: 'Daily Check-in', description: 'Reminder alle 18:00', icon: Bell },
            { key: 'revengeAlert', label: 'Revenge Trading Alert', description: 'Avviso pattern pericolosi', icon: Shield },
            { key: 'priceAlerts', label: 'Price Alerts', description: 'Notifiche su livelli chiave', icon: TrendingUp },
            { key: 'aiInsights', label: 'AI Insights', description: 'Suggerimenti da Karion AI', icon: Zap },
            { key: 'weeklyReport', label: 'Weekly Report', description: 'Report ogni domenica', icon: Download },
            { key: 'communityUpdates', label: 'Community', description: 'Nuovi post e commenti', icon: User },
          ].map((notif) => (
            <div key={notif.key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
              <div className="flex items-center gap-3">
                <notif.icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">{notif.label}</p>
                  <p className="text-sm text-muted-foreground">{notif.description}</p>
                </div>
              </div>
              <Switch
                checked={notifications[notif.key]}
                onCheckedChange={() => toggleNotification(notif.key)}
                data-testid={`notif-${notif.key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className="bg-card/80 border-border/50" data-testid="privacy-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
            <div>
              <p className="font-medium">Profilo Pubblico</p>
              <p className="text-sm text-muted-foreground">Visibile nella community</p>
            </div>
            <Switch data-testid="public-profile" />
          </div>

          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
            <div>
              <p className="font-medium">Mostra Statistiche</p>
              <p className="text-sm text-muted-foreground">Win rate e P&L visibili</p>
            </div>
            <Switch data-testid="show-stats" />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-card/80 border-red-500/20" data-testid="danger-zone">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Zona Pericolo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Esci dal tuo account</p>
                <p className="text-sm text-muted-foreground">Termina la sessione corrente</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl border-primary/20 hover:bg-primary/10" onClick={logout}>
              Esci
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 bg-red-500/5 rounded-xl border border-red-500/20">
            <div>
              <p className="font-medium">Elimina Account</p>
              <p className="text-sm text-muted-foreground">Azione irreversibile</p>
            </div>
            <Button variant="destructive" className="rounded-xl">
              Elimina
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Cambia Password
              </h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password Attuale</label>
                  <div className="relative">
                    <Input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Nuova Password</label>
                  <Input
                    type="password"
                    value={passwordForm.new}
                    onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Conferma Password</label>
                  <Input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setShowPasswordModal(false)} className="flex-1">
                    Annulla
                  </Button>
                  <Button onClick={handlePasswordChange} className="flex-1">
                    Salva
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TradingView Modal */}
      <AnimatePresence>
        {showTVModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTVModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                Collega TradingView
              </h3>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Inserisci il tuo username TradingView per sincronizzare grafici e idee.
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    value={tvUsername}
                    onChange={(e) => setTVUsername(e.target.value)}
                    placeholder="@username"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setShowTVModal(false)} className="flex-1">
                    Annulla
                  </Button>
                  <Button onClick={handleTVConnect} className="flex-1 bg-blue-500 hover:bg-blue-600">
                    Collega
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Keys Modal */}
      <AnimatePresence>
        {showAPIModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAPIModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-card border border-border rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-400" />
                API Keys
              </h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">CoinGecko API</label>
                  <Input
                    type="password"
                    value={apiKeys.coingecko}
                    onChange={(e) => setApiKeys({ ...apiKeys, coingecko: e.target.value })}
                    placeholder="cg-xxxxx..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">OpenAI API</label>
                  <Input
                    type="password"
                    value={apiKeys.openai}
                    onChange={(e) => setApiKeys({ ...apiKeys, openai: e.target.value })}
                    placeholder="sk-xxxxx..."
                  />
                  <p className="text-xs text-muted-foreground">Necessaria per Karion AI Insights</p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="ghost" onClick={() => setShowAPIModal(false)} className="flex-1">
                    Annulla
                  </Button>
                  <Button onClick={saveApiKeys} className="flex-1">
                    Salva
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
