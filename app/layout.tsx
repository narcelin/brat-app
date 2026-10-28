import type { Metadata, Viewport } from 'next'
import { ClerkProvider, Show } from '@clerk/nextjs'
import { AppHeader } from '../components/AppHeader'
import { ServiceWorker } from '../components/ServiceWorker'
import { TabBar } from '../components/TabBar'
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
    <ClerkProvider>
      <html lang="en">
        <body>
          <AppHeader />
          {children}
          <Show when="signed-in">
            <TabBar />
          </Show>
          <ServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  )
}
