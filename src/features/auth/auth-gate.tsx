'use client';
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/src/lib/firebase/client';
import { bootstrapSession } from '@/src/lib/repositories/session';
import { messages } from '@/src/i18n/messages';

export function AuthGate({ children }: { children: (ctx: { user: User; householdId: string }) => React.ReactNode }) {
  const [state, setState] = useState<{user: User; householdId: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const t = messages['pt-BR'];

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, async user => {
      if (!user) { setState(null); setLoading(false); return; }
      try { setState({ user, householdId: (await bootstrapSession()).householdId }); }
      finally { setLoading(false); }
    });
  }, []);

  if (!firebaseConfigured) return <main className="center-shell"><section className="setup-card"><div className="brand-mark">N</div><h1>NestBalance</h1><p>{t.setupMissing}</p></section></main>;
  if (loading) return <main className="center-shell"><div className="skeleton-card" aria-label="Carregando" /></main>;
  if (!state) return <main className="center-shell"><section className="login-card"><div><div className="eyebrow">MillionsNest</div><h1>NestBalance</h1><p>{t.brandTagline}</p></div><button className="primary-button" onClick={() => auth && signInWithPopup(auth, new GoogleAuthProvider())}>{t.signIn}</button></section></main>;
  return <>{children(state)}</>;
}
