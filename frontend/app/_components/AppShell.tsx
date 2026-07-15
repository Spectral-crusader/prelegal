'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { me, signOut, type Account } from '@/lib/auth';
import styles from './AppShell.module.css';

// The frame every signed-in screen sits in: brand, nav, sign-out, and the
// standing disclaimer.
//
// It is also the auth guard. A static export has no server to redirect at the
// edge, so the check has to happen in the browser: ask /api/me, and bounce to
// the login screen if there is no session. Children are not rendered until that
// answers, so a signed-out visitor never sees a flash of the app — nor do the
// children fire their own fetches only to get a 401 back.

type Props = {
  children: React.ReactNode;
  // Which nav link to mark as the page you are on.
  active: 'create' | 'documents';
};

export function AppShell({ children, active }: Props) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    void me().then((found) => {
      if (found) setAccount(found);
      else router.replace('/');
    });
  }, [router]);

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  // The guard is still resolving, or has already decided to redirect.
  if (!account) return <div className={styles.checking} aria-busy="true" />;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/app" className={styles.brand}>
            prelegal
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <Link
              href="/app"
              className={active === 'create' ? styles.linkActive : styles.link}
              aria-current={active === 'create' ? 'page' : undefined}
            >
              New document
            </Link>
            <Link
              href="/documents"
              className={active === 'documents' ? styles.linkActive : styles.link}
              aria-current={active === 'documents' ? 'page' : undefined}
            >
              My documents
            </Link>
          </nav>
          <div className={styles.account}>
            <span className={styles.email}>{account.email}</span>
            <button type="button" className={styles.signOut} onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <p className={styles.disclaimer} role="note">
        <strong>Draft only.</strong> Documents produced here are drafts and must be reviewed
        by a qualified lawyer before you sign or rely on them. prelegal does not provide
        legal advice.
      </p>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
