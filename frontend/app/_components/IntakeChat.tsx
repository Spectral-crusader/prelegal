'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, DocumentSpec, Fields } from '@/lib/types';
import styles from './IntakeChat.module.css';

type Props = {
  // The settled document's id, and its spec once the registry has loaded. The
  // id is passed rather than read off `spec` because the two can lag: the id
  // comes back with the turn, the spec only once GET /api/documents resolves,
  // and sending null for a document already settled would restart the
  // selection.
  documentId: string | null;
  // Where the backend is saving this conversation. Null until the first save;
  // sending it back is what makes the next turn update that draft rather than
  // start another.
  draftId: number | null;
  spec: DocumentSpec | null;
  fields: Fields;
  // The greeting for a new document, or a restored draft's conversation. Read
  // once, at mount: the transcript is this component's own state from then on.
  initialMessages: ChatMessage[];
  onTurn: (documentId: string | null, fields: Fields, draftId: number | null) => void;
};

export function IntakeChat({
  documentId,
  draftId,
  spec,
  fields,
  initialMessages,
  onTurn,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
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
        body: JSON.stringify({ messages: history, documentId, draftId, fields }),
      });
      if (!res.ok) throw new Error(`The assistant is unavailable (HTTP ${res.status}).`);

      const reply = await res.json();
      setMessages([...history, { role: 'assistant', content: reply.message }]);
      onTurn(reply.documentId, reply.fields, reply.draftId);
    } catch (err) {
      // Keep the user's message on screen so they can retry without retyping.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className={styles.chat} aria-label="Document intake chat">
      <h2 className={styles.heading}>{spec ? `${spec.name} — Intake` : 'What do you need?'}</h2>

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
