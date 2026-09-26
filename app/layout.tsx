import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Personal Health Service System',
  description: 'Manage personal health records, track measurements, control information sharing, and review account activity in one place.',
  openGraph: {
    title: 'Personal Health Service System',
    description: 'Manage personal health records, track measurements, control information sharing, and review account activity in one place.',
    type: 'website',
    images: [{
      url: '/og.png',
      width: 1200,
      height: 630,
      alt: 'Personal Health Service System interface preview',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Personal Health Service System',
    description: 'Manage personal health records, track measurements, control information sharing, and review account activity in one place.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
