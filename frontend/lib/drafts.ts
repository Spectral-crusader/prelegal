// Reading back stored drafts.
//
// Writing is the chat's job — every turn upserts the draft server-side and
// hands back its id — so there is no save() here.

import type { ChatMessage, Fields } from './types';

export type DraftSummary = {
  id: number;
  documentId: string;
  documentName: string;
  updatedAt: string; // "YYYY-MM-DD HH:MM:SS", UTC, from SQLite's datetime('now')
};

export type Draft = DraftSummary & {
  fields: Fields;
  transcript: ChatMessage[];
};

export async function listDrafts(): Promise<DraftSummary[]> {
  const res = await fetch('/api/drafts');
  if (!res.ok) throw new Error(`Could not load your documents (HTTP ${res.status}).`);
  return res.json();
}

export async function getDraft(id: number): Promise<Draft> {
  const res = await fetch(`/api/drafts/${id}`);
  if (!res.ok) throw new Error(`Could not open that document (HTTP ${res.status}).`);
  return res.json();
}

// SQLite stores naive UTC, which `new Date` would read as local time and show
// an hour or more adrift. The Z is what makes it a real instant.
export function formatUpdated(updatedAt: string): string {
  const date = new Date(`${updatedAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return updatedAt;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
