import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import Shell from './components/Shell';
import { CycleProvider } from './providers';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SROP Platform',
  description: 'Short Range Operating Plan — request, validate, consolidate, plan, approve, archive',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <CycleProvider>
          <Shell>{children}</Shell>
        </CycleProvider>
      </body>
    </html>
  );
}
