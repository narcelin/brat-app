'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** The three places a player actually goes, pinned to the bottom where a thumb
 *  is. Standings used to be a button at the foot of the home page and Vote only
 *  appeared there during voting, so on any other screen neither was reachable
 *  without first going home and scrolling.
 *
 *  Onboarding routes get no tabs: an unadmitted account on /join cannot use any
 *  of them, and /welcome must be finished before the rest of the app makes
 *  sense. */
const HIDDEN = ['/join', '/welcome']

type Tab = { href: string; label: string; icon: React.ReactNode; match: (path: string) => boolean }

const TABS: Tab[] = [
  {
    href: '/',
    label: 'this week',
    // Objectives live under this week, so their pages keep this tab lit.
    match: (path) => path === '/' || path.startsWith('/objective/'),
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    href: '/vote',
    label: 'vote',
    match: (path) => path === '/vote',
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8.5 12.5l2.5 2.5 5-5.5" />
      </>
    ),
  },
  {
    href: '/leaderboard',
    label: 'standings',
    match: (path) => path === '/leaderboard',
    icon: <path d="M5 20V12M12 20V5M19 20v-5" />,
  },
]

export function TabBar() {
  const pathname = usePathname()
  if (HIDDEN.includes(pathname)) return null

  return (
    <>
      {/* The bar is fixed, so it takes no space in the flow; this does, so the
          last thing on a page can scroll clear of it. */}
      <div className="tabbar-spacer" aria-hidden="true" />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
