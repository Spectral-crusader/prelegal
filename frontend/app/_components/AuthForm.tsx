'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { me, signIn, signUp } from '@/lib/auth';
import styles from './AuthForm.module.css';

// Sign in and sign up are the same card with different words and a different
// endpoint, so they share one component rather than drifting apart.

type Props = { mode: 'signin' | 'signup' };

const COPY = {
  signin: {
    title: 'Welcome back',
    subtitle: 'Sign in to pick up where you left off.',
    submit: 'Sign in',
    pending: 'Signing in…',
    prompt: 'New here?',
    linkText: 'Create an account',
    href: '/signup',
    autoComplete: 'current-password',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Draft standard business agreements in a conversation.',
    submit: 'Create account',
    pending: 'Creating account…',
    prompt: 'Already have an account?',
    linkText: 'Sign in',
    href: '/',
    autoComplete: 'new-password',
  },
} as const;

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const copy = COPY[mode];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Someone who is already signed in has no business on this screen.
  useEffect(() => {
    void me().then((account) => {
      if (account) router.replace('/app');
    });
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      await (mode === 'signup' ? signUp(email, password) : signIn(email, password));
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsBusy(false);
    }
    // Deliberately no `finally`: on success we are navigating away, and
    // re-enabling the button first only invites a second submit.
  }

  return (
    <main className={styles.main}>
      <form className={styles.card} onSubmit={(e) => void handleSubmit(e)}>
        <h1 className={styles.title}>prelegal</h1>
        <p className={styles.subtitle}>{copy.subtitle}</p>

        <h2 className={styles.heading}>{copy.title}</h2>

        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className={styles.input}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={copy.autoComplete}
          className={styles.input}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === 'signup' && (
          <p className={styles.hint}>At least 8 characters.</p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={isBusy}>
          {isBusy ? copy.pending : copy.submit}
        </button>

        <p className={styles.alt}>
          {copy.prompt} <Link href={copy.href}>{copy.linkText}</Link>
        </p>

        <p className={styles.notice}>
          Accounts and documents are stored for the life of the demo server and are
          cleared whenever it restarts. Documents produced here are drafts and need a
          lawyer&rsquo;s review.
        </p>
      </form>
    </main>
  );
}
