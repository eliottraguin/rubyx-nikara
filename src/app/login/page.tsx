'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginScene } from '@/components/LoginScene';
import { ZOOM_DURATION_MS } from '@/lib/city/camera-path';
import styles from './login.module.css';

type AuthMode = 'login' | 'register';

const FALLBACK_ERRORS: Record<number, string> = {
  401: 'Email ou mot de passe incorrect.',
  409: 'Un compte existe déjà avec cet email.',
  422: 'Vérifiez votre email et votre mot de passe (8 caractères minimum).',
};

function extractError(response: Response): string {
  const fallback = FALLBACK_ERRORS[response.status] ?? 'Une erreur est survenue. Réessayez.';
  return fallback;
}

export default function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const router = useRouter();
  const navigatedRef = useRef(false);
  const goHome = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push('/');
  }, [router]);

  // Filet de sécurité : si la scène ne peut pas animer (WebGL indisponible), on entre quand même.
  useEffect(() => {
    if (!entering) return;
    const id = window.setTimeout(goHome, ZOOM_DURATION_MS + 1500);
    return () => window.clearTimeout(id);
  }, [entering, goHome]);
  const isLogin = mode === 'login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });

      if (!response.ok) {
        setError(extractError(response));
        return;
      }
      // Session lives in the httpOnly auth_token cookie set by the API.
      setEntering(true);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(isLogin ? 'register' : 'login');
    setError('');
  };

  return (
    <main className={styles.container}>
      <div ref={containerRef} className={styles.scene} aria-hidden="true">
        <LoginScene containerRef={containerRef} zoom={entering} onZoomComplete={goHome} />
      </div>
      <div className={styles.form_overlay} style={entering ? { display: 'none' } : undefined}>
        <section className={styles.form_container} aria-labelledby="auth-title">
          <h1 id="auth-title">{isLogin ? 'Connexion' : 'Créer mon entreprise'}</h1>
          <p className={styles.subtitle}>
            {isLogin
              ? 'Retrouvez votre entreprise et vos commandes en cours.'
              : 'Créez votre compte pour lancer votre entreprise.'}
          </p>
          <form onSubmit={handleSubmit} noValidate={false}>
            <div className={styles.form_group}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="vous@exemple.fr"
              />
            </div>
            <div className={styles.form_group}>
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isLogin ? undefined : 8}
                placeholder={isLogin ? 'Votre mot de passe' : '8 caractères minimum'}
              />
            </div>
            <div role="alert" aria-live="assertive">
              {error && <div className={styles.error}>{error}</div>}
            </div>
            <button type="submit" disabled={loading} className={styles.submit_button}>
              {loading ? 'Chargement…' : isLogin ? 'Se connecter' : 'Créer mon entreprise'}
            </button>
          </form>
          <div className={styles.toggle}>
            <p>
              {isLogin ? 'Pas encore d’entreprise ? ' : 'Déjà un compte ? '}
              <button type="button" onClick={switchMode}>
                {isLogin ? 'Créer mon entreprise' : 'Se connecter'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
