import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';

import Shell from './components/Shell';
import { CycleProvider, ThemeProvider } from './providers';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'SROP Platform',
  description: 'Short Range Operating Plan — request, validate, consolidate, plan, approve, archive',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-bg font-body text-text">
        <ThemeProvider>
          <CycleProvider>
            <Shell>{children}</Shell>
          </CycleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
