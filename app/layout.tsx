import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Personal Health Service System — Course Demo',
  description: 'A local full-stack course demo for fictional personal health records, measurements, permission-based sharing, and access auditing.',
  openGraph: {
    title: 'Personal Health Service System — Course Demo',
    description: 'A local full-stack course demo for fictional personal health records, measurements, permission-based sharing, and access auditing.',
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
    title: 'Personal Health Service System — Course Demo',
    description: 'A local full-stack course demo for fictional personal health records, measurements, permission-based sharing, and access auditing.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
