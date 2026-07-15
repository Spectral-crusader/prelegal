// Sign up, sign in, sign out, and who am I.
//
// The session lives in an httpOnly cookie the browser attaches automatically,
// so there is no token to keep here — `me()` asking the backend is the only way
// to know whether we are signed in, and it is the truth rather than a cached
// guess.

export type Account = { id: number; email: string };

// The backend answers a failure with {detail: "..."}, which is written for the
// user. Surfacing it beats a status code.
async function post(path: string, body?: unknown): Promise<Response> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await detail(res));
  return res;
}

async function detail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    // A 422 from FastAPI's validation is a list of errors, not a string; its
    // first message is the useful one ("password: String should have at least
    // 8 characters").
    if (Array.isArray(body.detail)) return body.detail[0]?.msg ?? 'That did not look right.';
    if (typeof body.detail === 'string') return body.detail;
  } catch {
    // Not JSON — fall through to the status.
  }
  return `Something went wrong (HTTP ${res.status}).`;
}

export async function signUp(email: string, password: string): Promise<Account> {
  return (await post('/api/auth/signup', { email, password })).json();
}

export async function signIn(email: string, password: string): Promise<Account> {
  return (await post('/api/auth/signin', { email, password })).json();
}

export async function signOut(): Promise<void> {
  await post('/api/auth/signout');
}

// Null rather than a throw for the signed-out case: it is the ordinary answer
// for a visitor, not an error, and every caller is asking precisely to find out.
export async function me(): Promise<Account | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await detail(res));
  return res.json();
}
