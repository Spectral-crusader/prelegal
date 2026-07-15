import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'prelegal — Agreement Creator',
  description:
    'Draft standard business agreements in a conversation. Every document is a draft ' +
    'and needs review by a qualified lawyer.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}