'use client';
import { useCallback, useEffect, useState } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/src/lib/firebase/client';
import { bootstrapSession, type HouseholdSessionOption } from '@/src/lib/repositories/session';
import { messages } from '@/src/i18n/messages';
import { normalizeLocale, type AppLocale } from '@/src/core/locale';
import { LocaleProvider } from '@/src/i18n/locale-provider';

export type SessionState = {
  user: User;
  householdId: string;
  households: HouseholdSessionOption[];
  locale: AppLocale;
  currency: string;
};

export function AuthGate({ children }: { children: (ctx: SessionState) => React.ReactNode }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [browserLocale,setBrowserLocale]=useState<AppLocale>('pt-BR');
  const activeLocale=state?.locale||browserLocale;
  const activeCurrency=state?.currency||'BRL';
  const t=messages[activeLocale];

  useEffect(()=>{
    setBrowserLocale(normalizeLocale(navigator.language));
  },[]);

  const establishSession = useCallback(async (user: User, forceRefresh = false) => {
    setLoading(true);
    setSessionError('');
    try {
      if (forceRefresh) await user.getIdToken(true);
      const session = await bootstrapSession();
      setState({ user, householdId: session.householdId, households: session.households || [], locale:session.locale, currency:session.currency });
    } catch (error) {
      setState(null);
      setSessionError(error instanceof Error ? error.message : 'SESSION_BOOTSTRAP_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, user => {
      if (!user) {
        setState(null);
        setSessionError('');
        setLoading(false);
        return;
      }
      void establishSession(user);
    });
  }, [establishSession]);

  async function startGoogleSignIn() {
    if (!auth) return;
    setSigningIn(true);
    setSessionError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'AUTH_SIGN_IN_FAILED');
    } finally {
      setSigningIn(false);
    }
  }

  async function leaveSession() {
    if (!auth) return;
    await signOut(auth);
    setState(null);
    setSessionError('');
  }

  if (!firebaseConfigured) return <LocaleProvider locale={activeLocale} currency={activeCurrency}><main className="center-shell"><section className="setup-card"><div className="brand-mark">N</div><h1>NestBalance</h1><p>{t.setupMissing}</p></section></main></LocaleProvider>;
  if (loading) return <LocaleProvider locale={activeLocale} currency={activeCurrency}><main className="center-shell"><div className="skeleton-card" role="status"><span className="sr-only">{t.loading}</span></div></main></LocaleProvider>;

  const authenticatedUser = auth?.currentUser ?? null;
  if (!state && sessionError && authenticatedUser) {
    return <LocaleProvider locale={activeLocale} currency={activeCurrency}><main className="center-shell"><section className="login-card">
      <div>
        <div className="eyebrow">MillionsNest</div>
        <h1>NestBalance</h1>
        <p>{t.authSessionProblem}</p>
      </div>
      <div className="sheet-actions">
        <button className="ghost-button" onClick={() => void leaveSession()}>{t.signOut}</button>
        <button className="primary-button" onClick={() => void establishSession(authenticatedUser, true)}>{t.authRetry}</button>
      </div>
    </section></main></LocaleProvider>;
  }

  if (!state) return <LocaleProvider locale={activeLocale} currency={activeCurrency}><main className="center-shell"><section className="login-card"><div><div className="eyebrow">MillionsNest</div><h1>NestBalance</h1><p>{t.brandTagline}</p>{sessionError && <p className="error-copy" role="alert">{t.authSignInProblem}</p>}</div><button className="primary-button" disabled={signingIn} onClick={() => void startGoogleSignIn()}>{signingIn ? t.signingIn : t.signIn}</button></section></main></LocaleProvider>;
  return <LocaleProvider locale={state.locale} currency={state.currency}>{children(state)}</LocaleProvider>;
}
