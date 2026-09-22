'use client';
import { useCallback, useEffect, useState } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/src/lib/firebase/client';
import { bootstrapSession, type HouseholdSessionOption } from '@/src/lib/repositories/session';
import { messages, type Locale } from '@/src/i18n/messages';
import { LocaleProvider, preferredBrowserLocale } from '@/src/i18n/locale-provider';

export type SessionState = {
  user: User;
  householdId: string;
  households: HouseholdSessionOption[];
  locale: Locale;
};

export function AuthGate({ children }: { children: (ctx: SessionState) => React.ReactNode }) {
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [uiLocale,setUiLocale]=useState<Locale>('pt-BR');
  const t = messages[uiLocale];

  const establishSession = useCallback(async (user: User, forceRefresh = false) => {
    setLoading(true);
    setSessionError('');
    try {
      if (forceRefresh) await user.getIdToken(true);
      const session = await bootstrapSession();
      const households=session.households||[];
      const selected=households.find(item=>item.id===session.householdId);
      const locale=selected?.locale||preferredBrowserLocale();
      setUiLocale(locale);
      setState({ user, householdId: session.householdId, households, locale });
    } catch (error) {
      setState(null);
      setSessionError(error instanceof Error ? error.message : 'SESSION_BOOTSTRAP_FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(()=>{ setUiLocale(preferredBrowserLocale()); },[]);

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

  if (!firebaseConfigured) return <main className="center-shell"><section className="setup-card"><div className="brand-mark">N</div><h1>NestBalance</h1><p>{t.setupMissing}</p></section></main>;
  if (loading) return <main className="center-shell"><div className="skeleton-card" role="status"><span className="sr-only">Carregando</span></div></main>;

  const authenticatedUser = auth?.currentUser ?? null;
  if (!state && sessionError && authenticatedUser) {
    return <main className="center-shell"><section className="login-card">
      <div>
        <div className="eyebrow">MillionsNest</div>
        <h1>NestBalance</h1>
        <p>{t.authSessionProblem}</p>
      </div>
      <div className="sheet-actions">
        <button className="ghost-button" onClick={() => void leaveSession()}>{t.signOut}</button>
        <button className="primary-button" onClick={() => void establishSession(authenticatedUser, true)}>{t.authRetry}</button>
      </div>
    </section></main>;
  }

  if (!state) return <main className="center-shell"><section className="login-card"><div><div className="eyebrow">MillionsNest</div><h1>NestBalance</h1><p>{t.brandTagline}</p>{sessionError && <p className="error-copy" role="alert">{t.authSignInProblem}</p>}</div><button className="primary-button" disabled={signingIn} onClick={() => void startGoogleSignIn()}>{signingIn ? t.signingIn : t.signIn}</button></section></main>;
  return <LocaleProvider locale={state.locale}>{children(state)}</LocaleProvider>;
}
