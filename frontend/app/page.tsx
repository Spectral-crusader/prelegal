import { AuthForm } from './_components/AuthForm';

// The sign-in screen. Real as of PL-7: it authenticates against the users
// table, and there is no way through to /app without an account.
export default function SignInPage() {
  return <AuthForm mode="signin" />;
}
