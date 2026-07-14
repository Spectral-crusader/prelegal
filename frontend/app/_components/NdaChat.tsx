'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, MndaFields } from '@/lib/types';
import styles from './NdaChat.module.css';

// The opening line is fixed rather than generated: it costs a round trip to ask
// the model to say hello, and the first question is always the same one.
const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi — I'll help you put together a Mutual NDA. To start: what are you and " +
    'the other party planning to share information about?',
};

type Props = {
  fields: MndaFields;
  onFields: (next: MndaFields) => void;
};

export function NdaChat({ fields, onFields }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  async function send() {
    const text = draft.trim();
    if (!text || isSending) return;

    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages(history);
    setDraft('');
    setError(null);
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, fields }),
      });
      if (!res.ok) throw new Error(`The assistant is unavailable (HTTP ${res.status}).`);

      const reply = await res.json();
      setMessages([...history, { role: 'assistant', content: reply.message }]);
      onFields(reply.fields);
    } catch (err) {
      // Keep the user's message on screen so they can retry without retyping.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className={styles.chat} aria-label="NDA intake chat">
      <h2 className={styles.heading}>Mutual NDA — Intake</h2>

      <div className={styles.transcript}>
        {messages.map((m, i) => (
          <p key={i} className={m.role === 'user' ? styles.user : styles.assistant}>
            {m.content}
          </p>
        ))}
        {isSending && <p className={styles.thinking}>Thinking…</p>}
        {error && <p className={styles.error}>{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter for a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type your answer…"
          aria-label="Your message"
        />
        <button type="submit" disabled={isSending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
