import type { Metadata, Viewport } from 'next';
import { Caveat, JetBrains_Mono, Patrick_Hand } from 'next/font/google';
import './globals.css';

// Hand-drawn type system per DESIGN_TOKENS.md.
//   Patrick Hand = body / UI sans (default `font-sans`)
//   Caveat       = decorative display headers (`font-display`)
//   JetBrains Mono = numbers, dates, codes (`font-mono`)
const patrickHand = Patrick_Hand({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-sans',
  display: 'swap',
});
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Deadline Tracker',
  description: 'Personal assignment and interview-prep tracker.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${patrickHand.variable} ${caveat.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-bg text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
