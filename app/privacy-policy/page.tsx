import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy — Brapids' }

export default function PrivacyPolicyPage() {
  return (
    <main className="screen">
      <header>
        <h1>Privacy Policy</h1>
        <p className="sub">Effective September 6, 2026 · brats.anico.dev</p>
      </header>

      <div className="legal">
        <div className="tldr">
          <b>Plain-English summary</b>
          <p>
            I&apos;m not in the data business. Brapids doesn&apos;t run ads, doesn&apos;t have
            analytics tracking, and doesn&apos;t sell or share anything with data brokers.
            It&apos;s a private game for a handful of invited friends, and this policy exists so
            you know exactly what&apos;s stored and why before you use it.
          </p>
          <p>
            The honest caveat: the app is built on Clerk (sign-in), Vercel (hosting + file
            storage), and Neon (database) — so some of your information sits on infrastructure I
            don&apos;t personally control, governed by those companies&apos; own privacy
            policies as well as this one. That&apos;s the whole picture; there&apos;s nothing
            else going on behind it.
          </p>
        </div>

        <section>
          <h2>1. Overview</h2>
          <p>
            This Privacy Policy explains what information Brapids collects when you use it, why,
            who else can see it, and what control you have over it. It covers the app at
            brats.anico.dev and pairs with the <Link href="/terms-of-service">Terms of Service</Link>.
          </p>
        </section>

        <section>
          <h2>2. Who runs this</h2>
          <p>
            Brapids is a personal project built and operated by Nicolas Arcelin, not a company.
            There is no separate legal entity, no data-processing business, and no funding model
            — the app exists to run a game for a private group of invited players.
          </p>
        </section>

        <section>
          <h2>3. What&apos;s collected</h2>
          <table>
            <thead>
              <tr><th>Category</th><th>What it includes</th><th>Where it lives</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Account &amp; identity</td>
                <td>Email address, name, sign-in/session data</td>
                <td>Clerk</td>
              </tr>
              <tr>
                <td>Player profile</td>
                <td>Display name, chosen avatar (from a fixed set of presets — not a photo of you)</td>
                <td>Neon (Postgres)</td>
              </tr>
              <tr>
                <td>Submissions</td>
                <td>Photos and short videos you record in-app as proof, plus timestamps and which objective they&apos;re for</td>
                <td>Vercel Blob</td>
              </tr>
              <tr>
                <td>Game activity</td>
                <td>Your votes, rankings, and resulting scores</td>
                <td>Neon (Postgres)</td>
              </tr>
              <tr>
                <td>Basic request logs</td>
                <td>Standard server logs (e.g. IP address, timestamps) generated automatically by hosting infrastructure</td>
                <td>Vercel</td>
              </tr>
            </tbody>
          </table>
          <p>There is no advertising SDK, analytics tracker, or third-party marketing pixel anywhere in the app.</p>
        </section>

        <section>
          <h2>4. How it&apos;s used</h2>
          <ul>
            <li>To let you sign in and identify you to other players (name, avatar)</li>
            <li>To run the game itself — storing your submissions until reveal, tallying votes, calculating scores and the leaderboard</li>
            <li>To keep the app secure and debug problems when something breaks</li>
          </ul>
          <p>Nothing you submit is used for advertising, profiling, or any purpose outside running the game.</p>
        </section>

        <section>
          <h2>5. Who can see it</h2>
          <p>Brapids is a closed group — only invited, signed-in players can see anything in the app. Within that group:</p>
          <ul>
            <li>Your submission for a given objective is hidden from everyone (including other players) until the submission window for that week closes.</li>
            <li>Once revealed, your submission, display name, and avatar are visible to other invited players so they can vote.</li>
            <li>Individual votes are used to calculate scores; the operator can see raw voting data to run the game and troubleshoot disputes.</li>
            <li>Nothing is ever visible outside the invited player group, and the app has no public pages showing submissions or scores.</li>
          </ul>
        </section>

        <section>
          <h2>6. Third-party processors</h2>
          <p>Brapids runs on infrastructure operated by other companies, each of which processes some of your data under their own privacy policy in addition to this one:</p>
          <ul>
            <li>
              <b>Clerk</b> (authentication) — handles your email, sign-in credentials, and
              session security. See{' '}
              <a href="https://clerk.com/legal/privacy" target="_blank" rel="noopener noreferrer">Clerk&apos;s Privacy Policy</a>.
            </li>
            <li>
              <b>Vercel</b> (hosting, and Vercel Blob for file storage) — serves the app and
              stores the photos/videos you submit, plus standard server request logs. See{' '}
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel&apos;s Privacy Policy</a>.
            </li>
            <li>
              <b>Neon</b> (database, provisioned via the Vercel Marketplace) — stores game data
              such as your profile, submissions metadata, votes, and scores. See{' '}
              <a href="https://neon.com/privacy-policy" target="_blank" rel="noopener noreferrer">Neon&apos;s Privacy Policy</a>.
            </li>
          </ul>
          <p>
            None of these providers are used by the operator to sell your data or serve you ads
            — they&apos;re the plumbing the app runs on, not separate data businesses this
            project engages in.
          </p>
        </section>

        <section>
          <h2>7. Retention</h2>
          <p>
            Your data is kept for as long as your account is active and the season it relates to
            is relevant to the game (e.g. for the leaderboard). If you leave the group or ask for
            your account to be removed, the operator will delete your account data and
            submissions within a reasonable time, except where a copy needs to be kept briefly to
            resolve an active dispute (e.g. a contested vote).
          </p>
        </section>

        <section>
          <h2>8. Your rights</h2>
          <p>Because this is a small, invite-only project, you don&apos;t need to file a formal request through a portal — just email the operator directly:</p>
          <ul>
            <li><b>Access</b> — ask what&apos;s stored about you</li>
            <li><b>Correction</b> — fix inaccurate profile information</li>
            <li><b>Deletion</b> — have your account and submissions removed</li>
            <li><b>Export</b> — get a copy of your own submissions and scores</li>
          </ul>
          <p>See Contact below.</p>
        </section>

        <section>
          <h2>9. Security</h2>
          <p>
            Access is limited to invited, authenticated players, and sign-in is handled by Clerk
            rather than a custom, hand-rolled login system. Submitted media is served through
            Vercel&apos;s storage infrastructure. This is a hobby project maintained by one
            person on a best-effort basis — reasonable care is taken, but no system is
            guaranteed unbreakable, and no warranty of absolute security is made.
          </p>
        </section>

        <section>
          <h2>10. Age</h2>
          <p>
            Brapids is invite-only and restricted to players 18 and older. It is not directed at
            children, and the operator does not knowingly collect information from anyone under
            18.
          </p>
        </section>

        <section>
          <h2>11. Changes to this policy</h2>
          <p>
            If what&apos;s collected or how it&apos;s used changes in a meaningful way, players
            will be notified in the app or directly before the change takes effect. Continuing
            to use Brapids after that means you accept the update.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            For any privacy question or to exercise the rights above, email{' '}
            <a href="mailto:nicotech@fastmail.com">nicotech@fastmail.com</a> directly.
          </p>
        </section>

        <p className="doc-footer">
          Brapids Privacy Policy — see also the{' '}
          <Link href="/terms-of-service">Terms of Service</Link> for the rules of using the app.
        </p>
      </div>
    </main>
  )
}
