import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  Settings, Moon, Sun, Globe, User, Bell, Shield, Palette,
  Lock, Key, ExternalLink, Check, X, Eye, EyeOff,
  TrendingUp, Download, Trash2, Volume2, Zap, Database, LogOut,
  CreditCard, FileText, Activity, Mail, Plus, Pencil, Share2, Info,
  MessageSquare, Sparkles, Heart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportModal, WhatsNewModal, InviteFriendModal } from '../ui/SupportModals';

const API = `${(process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '')}/api`;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { logout, user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('account');

  // Modals state
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Subscriptions Tab State
  const [timeRemaining, setTimeRemaining] = useState({ days: 1, hours: 3, mins: 34, secs: 24 });

  // Account security state
  const [accountState, setAccountState] = useState(null);
  const [accountLoading, setAccountLoading] = useState(false);

  // Credential flows
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordCode, setPasswordCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordCodeSent, setPasswordCodeSent] = useState(false);

  // Phone verification flow
  const phoneCountries = [
    { code: '+39', label: 'Italia (+39)' },
    { code: '+1', label: 'USA/Canada (+1)' },
    { code: '+44', label: 'UK (+44)' },
    { code: '+33', label: 'Francia (+33)' },
    { code: '+49', label: 'Germania (+49)' },
    { code: '+34', label: 'Spagna (+34)' },
    { code: '+41', label: 'Svizzera (+41)' },
  ];
  const [phoneCountryCode, setPhoneCountryCode] = useState('+39');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        let { days, hours, mins, secs } = prev;
        if (secs > 0) secs--;
        else {
          secs = 59;
          if (mins > 0) mins--;
          else {
            mins = 59;
            if (hours > 0) hours--;
            else {
              hours = 23;
              if (days > 0) days--;
            }
          }
        }
        return { days, hours, mins, secs };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAccountState = async () => {
    setAccountLoading(true);
    try {
      const [securityRes, linkedRes] = await Promise.all([
        axios.get(`${API}/account/security-state`),
        axios.get(`${API}/account/linked-accounts`).catch(() => ({ data: null })),
      ]);
      setAccountState({
        ...securityRes.data,
        linked_accounts: linkedRes.data?.linked_accounts || securityRes.data?.linked_accounts || [],
        current_provider: linkedRes.data?.current_provider || securityRes.data?.current_provider || 'password',
      });
    } catch (error) {
      console.error('Failed to load account state', error);
      toast.error('Impossibile caricare impostazioni account');
    } finally {
      setAccountLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'account') {
      loadAccountState();
    }
  }, [activeTab]);

  const requestEmailCode = async () => {
    if (!newEmail) {
      toast.error('Inserisci una nuova email');
      return;
    }
    try {
      const { data } = await axios.post(`${API}/account/email/request-code`, { new_email: newEmail });
      setEmailCodeSent(true);
      if (data?.debug_code) setEmailCode(data.debug_code);
      toast.success(`Codice inviato a ${data?.target || 'nuova email'}`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Invio codice non riuscito');
    }
  };

  const confirmEmailChange = async () => {
    if (!emailCode) {
      toast.error('Inserisci il codice');
      return;
    }
    try {
      const { data } = await axios.post(`${API}/account/email/confirm`, {
        new_email: newEmail,
        code: emailCode,
      });
      if (data?.access_token) {
        localStorage.setItem('token', data.access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
      }
      await refreshUser();
      await loadAccountState();
      setShowEmailForm(false);
      setEmailCode('');
      setEmailCodeSent(false);
      toast.success('Email aggiornata con successo');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Verifica email fallita');
    }
  };

  const requestPasswordCode = async () => {
    try {
      const { data } = await axios.post(`${API}/account/password/request-code`);
      setPasswordCodeSent(true);
      if (data?.debug_code) setPasswordCode(data.debug_code);
      toast.success(`Codice inviato a ${data?.target || 'email account'}`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Invio codice non riuscito');
    }
  };

  const confirmPasswordChange = async () => {
    if (!passwordCode || newPassword.length < 8) {
      toast.error('Inserisci codice e nuova password (min 8 caratteri)');
      return;
    }
    try {
      await axios.post(`${API}/account/password/confirm`, {
        code: passwordCode,
        new_password: newPassword,
      });
      setShowPasswordForm(false);
      setPasswordCode('');
      setNewPassword('');
      setPasswordCodeSent(false);
      toast.success('Password aggiornata');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Cambio password fallito');
    }
  };

  const requestPhoneCode = async () => {
    if (!phoneNumber) {
      toast.error('Inserisci il numero di telefono');
      return;
    }
    try {
      const { data } = await axios.post(`${API}/account/phone/request-code`, {
        country_code: phoneCountryCode,
        phone_number: phoneNumber,
        channel: 'sms',
      });
      setPhoneCodeSent(true);
      if (data?.debug_code) setPhoneCode(data.debug_code);
      toast.success(`Codice inviato (${data?.channel || 'sms'})`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Invio codice telefono non riuscito');
    }
  };

  const confirmPhoneCode = async () => {
    if (!phoneCode) {
      toast.error('Inserisci il codice SMS');
      return;
    }
    try {
      await axios.post(`${API}/account/phone/confirm`, {
        country_code: phoneCountryCode,
        phone_number: phoneNumber,
        code: phoneCode,
      });
      setPhoneCodeSent(false);
      setPhoneCode('');
      await loadAccountState();
      toast.success('Telefono verificato');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Verifica telefono fallita');
    }
  };

  const handleUnlinkProvider = async (provider) => {
    try {
      const { data } = await axios.delete(`${API}/account/linked-accounts/${provider}`);
      toast.success(`Account ${provider} scollegato`);
      if (data?.force_logout) {
        logout();
        window.location.href = '/auth';
        return;
      }
      await loadAccountState();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Impossibile scollegare account');
    }
  };

  const menuSections = [
    {
      title: 'ACCOUNT E SICUREZZA',
      items: [
        { id: 'account', label: 'Impostazioni account', icon: Settings },
      ]
    },
    {
      title: 'PAGAMENTO',
      items: [
        { id: 'abbonamenti', label: 'Abbonamenti', icon: Zap },
        { id: 'metodi_pagamento', label: 'Metodi di pagamento', icon: CreditCard },
        { id: 'storico_fatturazione', label: 'Storico fatturazione', icon: FileText },
        { id: 'stato_abbonato', label: 'Stato dell\'abbonato', icon: Activity },
      ]
    },
    {
      title: 'NOTIFICHE',
      items: [
        { id: 'consegna_alert', label: 'Consegna degli alert', icon: Bell },
        { id: 'abbonamenti_email', label: 'Abbonamenti e-mail', icon: Mail },
      ]
    },
    {
      title: 'SUPPORTO E RISORSE',
      items: [
        { id: 'modal_supporto', label: 'Centro di supporto', icon: MessageSquare, action: () => setIsSupportOpen(true) },
        { id: 'modal_novita', label: 'Cosa c\'è di nuovo', icon: Sparkles, action: () => setIsWhatsNewOpen(true) },
        { id: 'modal_invita', label: 'Invita un amico', icon: Heart, action: () => setIsInviteOpen(true) },
      ]
    }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'abbonamenti':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Promo Card */}
            <div className="relative group overflow-hidden rounded-3xl bg-black border border-white/10 h-[220px]">
              {/* Background Glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-blue-900/20 to-pink-900/30 opacity-60" />
              <div className="absolute top-0 right-0 w-full h-full overflow-hidden">
                <div className="absolute top-10 right-10 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-10 right-40 w-48 h-48 bg-purple-500/20 rounded-full blur-[80px]" />
              </div>

              <div className="relative h-full p-10 flex flex-col justify-center">
                <div>
                  <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Nuove offerte a breve disponibili</h2>
                </div>
              </div>
            </div>

            {/* Current Subscription */}
            <section>
              <h3 className="text-xl font-bold text-white mb-6">Sottoscrizione attuale</h3>
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-bold text-white">Essential</span>
                      <a href="#" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-sm font-medium">
                        Dettagli del piano <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-white/70 text-base font-medium">
                      Mensile • Prossimo pagamento: €20.68 il Mar 10, 2026
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <div className="w-6 h-4 bg-orange-500 rounded-sm" /> {/* Mock Mastercard logo */}
                      <span className="text-base font-mono text-white/80">••2643</span>
                    </div>
                    <button className="text-white/40 hover:text-white transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" className="rounded-xl h-11 px-6 font-bold bg-white/10 hover:bg-white/15 text-white">
                    Cambia abbonamento
                  </Button>
                  <Button variant="outline" className="rounded-xl h-11 px-6 font-bold border-white/10 hover:bg-white/5 text-white/60">
                    Cancella l'abbonamento
                  </Button>
                </div>
              </div>
            </section>

          </div>
        );

      case 'metodi_pagamento':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-3xl font-bold text-white">Metodi di pagamento</h2>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8">
              <h3 className="text-lg font-bold text-white mb-6">Aggiungi una carta</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Numero della carta</Label>
                  <div className="relative">
                    <Input className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-white/20 pl-4 pr-12" placeholder="0000 0000 0000 0000" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
                      <div className="w-8 h-5 bg-white/10 rounded-sm" />
                      <div className="w-8 h-5 bg-white/10 rounded-sm" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Scadenza</Label>
                    <Input className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-white/20" placeholder="MM / YY" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">CVC</Label>
                    <Input className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-white/20" placeholder="123" />
                  </div>
                </div>

                <Button className="w-full h-14 bg-white text-black hover:bg-white/90 rounded-2xl font-black text-lg mt-4">
                  Salva carta
                </Button>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5">
              <h3 className="text-lg font-bold text-white mb-4">Declinazione di responsabilità</h3>
              <p className="text-white/60 text-base leading-relaxed font-medium">
                I dati della tua carta vengono elaborati in modo sicuro tramite i nostri partner di pagamento certificati PCI. Karion Trading OS non memorizza mai i dettagli completi della tua carta sui propri server.
              </p>
            </div>
          </div>
        );

      case 'storico_fatturazione':
        const historyData = [];
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-3xl font-bold text-white">Storico fatturazione</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-white text-base uppercase font-black tracking-widest border-b border-white/10">
                    <th className="pb-6 font-black">Data</th>
                    <th className="pb-6 font-black">Azione</th>
                    <th className="pb-6 font-black">ID transazione</th>
                    <th className="pb-6 font-black text-right">Totale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {historyData.map((row, i) => (
                    // ... existing row mapping (will render nothing since historyData is empty)
                    <tr key={i} />
                  ))}
                  {historyData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center text-white/50 font-medium text-base">
                        Nessuna fattura disponibile al momento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'stato_abbonato': {
        const benefits = [
          "Dati di mercato in tempo reale",
          "Allarmi tecnici avanzati",
          "Screener azionario e crypto",
          "Copilot AI Personale (Smarter Analysis)",
          "Analisi COT e Options Flow",
          "Trading Journal illimitato",
          "Backtesting e Monte Carlo Analysis",
          "Accesso alla Community Pro"
        ];
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-3xl font-bold text-white">Stato dell'abbonamento</h2>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-6">
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold uppercase tracking-widest border border-emerald-500/20">Attivo</span>
              </div>

              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">Benefit Inclusi</h3>
                <p className="text-white/70 text-base font-medium">Lista completa dei vantaggi attivi sul tuo account.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <Check className="w-3 h-3 text-emerald-500" />
                    </div>
                    <span className="text-white/90 text-base font-medium group-hover:text-white transition-colors">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex-1">
                <p className="text-xs font-bold text-white/50 uppercase tracking-[0.2em] mb-2">Membro dal</p>
                <p className="text-white font-black text-xl">Gennaio 2026</p>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex-1">
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-2">Prossimo rinnovo</p>
                <p className="text-white font-black text-xl">10 Mar 2026</p>
              </div>
            </div>
          </div>
        );
      }

      case 'abbonamenti_email':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-3xl font-bold text-white">Abbonamenti e-mail</h2>
            <div className="space-y-6">
              {[
                { title: 'Materiale di supporto', desc: 'Suggerimenti e trucchi per ottenere il massimo da TradingView.', icon: Mail },
                { title: 'Aggiornamenti sui prodotti', desc: 'Scopri gli ultimi aggiornamenti e miglioramenti di TradingView.', icon: TrendingUp },
                { title: 'Sconti e promozioni', desc: 'Diventa il primo a ricevere promozioni ed offerte esclusive', icon: Zap },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between group p-2 rounded-xl hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                      <item.icon className="w-6 h-6 text-white/60" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white">{item.title}</h4>
                      <p className="text-white/40 text-sm font-medium">{item.desc}</p>
                    </div>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </div>
            <div className="pt-8 border-t border-white/5 flex justify-end">
              <Button variant="outline" className="h-12 rounded-xl border-white/10 hover:bg-white/5 text-white/60 font-bold px-6">
                Disiscriviti da tutto
              </Button>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {accountLoading && (
              <div className="text-sm text-white/50">Aggiornamento impostazioni account...</div>
            )}
            {/* Credentials */}
            <section>
              <h3 className="text-xl font-bold text-white mb-6">Credenziali di accesso</h3>
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">E-mail</Label>
                    <p className="text-white font-bold mt-1">{accountState?.email || user?.email || 'co•••••@gm•••••'}</p>
                    <p className="text-xs text-white/40 mt-1">
                      {accountState?.email_verified ? 'Email verificata' : 'Email non verificata'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl h-10 border-white/10 hover:bg-white/5"
                    onClick={() => setShowEmailForm(!showEmailForm)}
                  >
                    Cambia email
                  </Button>
                </div>
                <div className="flex justify-start">
                  <Button
                    variant="outline"
                    className="rounded-xl h-10 border-white/10 hover:bg-white/5"
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                  >
                    Modifica password
                  </Button>
                </div>

                {showEmailForm && (
                  <div className="mt-5 space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                    <Input
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Nuova email"
                      className="bg-white/5 border-white/10 text-white"
                    />
                    {emailCodeSent && (
                      <Input
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        placeholder="Codice verifica"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button className="rounded-xl" onClick={requestEmailCode}>
                        Invia codice
                      </Button>
                      {emailCodeSent && (
                        <Button variant="secondary" className="rounded-xl" onClick={confirmEmailChange}>
                          Conferma cambio email
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {showPasswordForm && (
                  <div className="mt-5 space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                    {passwordCodeSent && (
                      <Input
                        value={passwordCode}
                        onChange={(e) => setPasswordCode(e.target.value)}
                        placeholder="Codice verifica"
                        className="bg-white/5 border-white/10 text-white"
                      />
                    )}
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nuova password (min 8 caratteri)"
                      className="bg-white/5 border-white/10 text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button className="rounded-xl" onClick={requestPasswordCode}>
                        Invia codice
                      </Button>
                      {passwordCodeSent && (
                        <Button variant="secondary" className="rounded-xl" onClick={confirmPasswordChange}>
                          Conferma password
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>



            {/* Phone Management */}
            <section>
              <h3 className="text-xl font-bold text-white mb-6">Verifica del telefono</h3>
              <div className="space-y-3 bg-white/[0.03] border border-white/10 rounded-2xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Select value={phoneCountryCode} onValueChange={setPhoneCountryCode}>
                    <SelectTrigger className="bg-white/5 border-white/10 h-12 rounded-xl text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#121517] border-white/10">
                      {phoneCountries.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Numero telefono"
                    className="bg-white/5 border-white/10 h-12 rounded-xl text-white"
                  />
                  <Button className="h-12 rounded-xl font-bold" onClick={requestPhoneCode}>
                    Invia codice
                  </Button>
                </div>
                {phoneCodeSent && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      value={phoneCode}
                      onChange={(e) => setPhoneCode(e.target.value)}
                      placeholder="Codice SMS / verifica"
                      className="bg-white/5 border-white/10 h-12 rounded-xl text-white md:col-span-2"
                    />
                    <Button variant="secondary" className="h-12 rounded-xl font-bold" onClick={confirmPhoneCode}>
                      Conferma numero
                    </Button>
                  </div>
                )}
                <p className="text-xs text-white/50">
                  Stato attuale: {accountState?.phone_verified ? `verificato (${accountState?.phone_masked || accountState?.phone_number})` : 'non verificato'}
                </p>
              </div>
            </section>

            {/* External Accounts */}
            <section>
              <h3 className="text-xl font-bold text-white mb-6">Account esterni collegati</h3>
              <div className="space-y-4">
                {(accountState?.linked_accounts || []).map((account, i) => (
                  <div key={`${account.provider}-${i}`} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/10 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                        <TrendingUp className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white capitalize">{account.provider}</h4>
                        <p className="text-white/60 text-sm">
                          {account.identifier || 'collegato'} {account.provider === accountState?.current_provider ? '• Sessione attiva' : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="rounded-xl h-10 border-white/10 hover:bg-white/5 hover:text-red-500 hover:border-red-500/30"
                      disabled={account.provider === accountState?.current_provider && (accountState?.linked_accounts || []).length <= 1}
                      onClick={() => handleUnlinkProvider(account.provider)}
                    >
                      Elimina
                    </Button>
                  </div>
                ))}
                {accountState?.linked_accounts?.length === 0 && (
                  <p className="text-white/50 text-sm">Nessun account esterno collegato.</p>
                )}
              </div>
            </section>

            {/* Account Deletion */}
            <section className="pt-10 border-t border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-xl font-bold text-white">Eliminazione dell'account</h3>
                <Info className="w-4 h-4 text-white/20" />
              </div>
              <p className="text-white/70 text-base mb-6 max-w-lg leading-relaxed">
                Se desideri cancellare il tuo account, puoi farlo. Il processo richiederà 30 giorni, potrai richiedere la riattivazione entro questo periodo.
              </p>
              <Button variant="destructive" className="rounded-xl h-12 px-8 font-bold bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20">
                Elimina account
              </Button>
            </section>
          </div >
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 mb-6">
              <Settings className="w-10 h-10 text-white/20" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Work in Progress</h3>
            <p className="text-white/40 max-w-xs font-medium">Questa sezione è in fase di sviluppo. Torna a visitarci presto!</p>
          </div>
        );
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto min-h-screen bg-black font-apple" data-testid="settings-page">
      {/* Page Header */}
      <header className="py-12 px-4 md:px-0">
        <h1 className="text-4xl font-black text-white tracking-tight">Impostazioni</h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-12 pb-20">
        {/* Side Navigation */}
        <aside className="space-y-10 px-4 md:px-0">
          {menuSections.map((section, idx) => (
            <div key={idx} className="space-y-4">
              <h5 className="text-xs font-black text-white/50 uppercase tracking-[0.2em] px-4">
                {section.title}
              </h5>
              <nav className="space-y-1">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={item.action ? item.action : () => setActiveTab(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-base font-bold group",
                      activeTab === item.id
                        ? "bg-white/10 text-white shadow-lg"
                        : "text-white/60 hover:text-white hover:bg-white/[0.03]"
                    )}
                  >
                    <item.icon className={cn(
                      "w-5 h-5 transition-colors",
                      activeTab === item.id ? "text-primary" : "text-white/50 group-hover:text-white"
                    )} />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        {/* Tab Content Area */}
        <main className="px-4 md:px-0 min-h-[600px] pb-20">
          {renderTabContent()}
        </main>
      </div>

      {/* Persistence / Action Logic */}
      <AnimatePresence>
        <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
        <WhatsNewModal isOpen={isWhatsNewOpen} onClose={() => setIsWhatsNewOpen(false)} />
        <InviteFriendModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} />
      </AnimatePresence>
    </div>
  );
}
