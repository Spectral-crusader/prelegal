'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from './page.module.css';

// Placeholder sign-in. PL-4 builds the foundation only: there is no
// authentication yet, so any input takes the user through to the platform.
// Real sign up / sign in against the users table lands in a later ticket.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    router.push('/app');
  }

  return (
    <main className={styles.main}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>prelegal</h1>
        <p className={styles.subtitle}>Draft legal agreements from standard templates.</p>

        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
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
          className={styles.input}
          placeholder="••••••••"
        />

        <button type="submit" className={styles.submit}>
          Sign in
        </button>

        <p className={styles.notice}>
          Demo sign-in — authentication is not implemented yet. Any details will take you
          through to the platform.
        </p>
      </form>
    </main>
  );
}
