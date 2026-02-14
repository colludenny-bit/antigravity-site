import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { TrendingUp, Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';

export default function AuthPage() {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode');

  const [isLogin, setIsLogin] = useState(initialMode !== 'register');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        toast.success('Benvenuto!');
      } else {
        await register(formData.email, formData.password, formData.name);
        toast.success('Account creato con successo!');
      }
    } catch (error) {
      console.error("Auth Error:", error);
      const detail = error.response?.data?.detail;
      const status = error.response?.status;
      toast.error(detail ? `Errore: ${detail}` : `Errore ${status || ''}: Impossibile completare l'operazione`);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setLoading(true);
    try {
      // Simulate Social Login by using a dedicated demo account
      const socialEmail = provider === 'google' ? 'google_user@karion.io' : 'apple_user@karion.io';
      const socialPass = 'social_login_pass';
      const socialName = provider === 'google' ? 'Google User' : 'Apple User';

      if (isLogin) {
        try {
          await login(socialEmail, socialPass);
          toast.success(`Accesso con ${provider === 'google' ? 'Google' : 'Apple'} riuscito!`);
        } catch (e) {
          toast.error("Utente non trovato. Devi prima registrarti.");
        }
      } else {
        try {
          await register(socialEmail, socialPass, socialName);
          toast.success(`Registrazione con ${provider === 'google' ? 'Google' : 'Apple'} completata!`);
        } catch (e) {
          toast.error("Utente già registrato. Effettua il login.");
        }
      }
    }
    } catch (error) {
    console.error("Social Auth Error:", error);
    const detail = error.response?.data?.detail || error.message;
    toast.error(`Errore Social Login: ${detail}`);
  } finally {
    setLoading(false);
  }
};

return (
  <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
    {/* Background Effects */}
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />

    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md relative z-10"
    >
      <Card className="glass-card border-border/50 shadow-2xl" data-testid="auth-card">
        <CardHeader className="text-center space-y-4 pb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center"
          >
            <TrendingUp className="w-8 h-8 text-primary" />
          </motion.div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-widest">KARION</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              {isLogin ? 'Bentornato, trader' : 'Inizia il tuo viaggio'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <Label htmlFor="name" className="text-sm font-medium">
                  {t('auth.name')}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Il tuo nome"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="pl-10 h-12 bg-white/5 border-border/50 rounded-xl"
                    required={!isLogin}
                    data-testid="auth-name-input"
                  />
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t('auth.email')}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="trader@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 h-12 bg-white/5 border-border/50 rounded-xl"
                  required
                  data-testid="auth-email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                {t('auth.password')}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 h-12 bg-white/5 border-border/50 rounded-xl"
                  required
                  data-testid="auth-password-input"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold btn-press"
              data-testid="auth-submit-btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? t('auth.login') : t('auth.register')}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              data-testid="auth-toggle-btn"
            >
              {isLogin ? t('auth.no_account') : t('auth.has_account')}{' '}
              <span className="text-primary font-medium">
                {isLogin ? t('auth.register') : t('auth.login')}
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">oppure</span>
            </div>
          </div>

          {/* Social Login Placeholder */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 rounded-xl border-border/50 hover:bg-white/5"
              onClick={() => handleSocialLogin('google')}
              disabled={loading}
              data-testid="google-login-btn"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continua con Google
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full h-12 rounded-xl border-border/50 hover:bg-white/5"
              onClick={() => handleSocialLogin('apple')}
              disabled={loading}
              data-testid="apple-login-btn"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              Continua con Apple
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground mt-6">
        Accedendo accetti i nostri{' '}
        <span className="text-primary cursor-pointer">Termini di Servizio</span> e{' '}
        <span className="text-primary cursor-pointer">Privacy Policy</span>
      </p>
    </motion.div>
  </div>
);
}
