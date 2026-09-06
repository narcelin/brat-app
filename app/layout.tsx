import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brats',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Brats', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/icon-180.png' },
}

export const viewport: Viewport = {
  themeColor: '#8ACE00',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
