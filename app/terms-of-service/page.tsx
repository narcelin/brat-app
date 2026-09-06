import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service — Brapids' }

export default function TermsOfServicePage() {
  return (
    <main className="screen">
      <header>
        <h1>Terms of Service</h1>
        <p className="sub">Effective September 6, 2026 · brats.anico.dev</p>
      </header>

      <div className="legal">
        <div className="tldr">
          <b>Plain-English summary</b>
          <p>
            Brapids is a private, invite-only game built for a small friend group — not a
            company, not a product with a business model. You post proof of dumb challenges,
            your friends vote on it, and a leaderboard keeps score.
          </p>
          <p>
            I&apos;m not trying to collect your data or make money off it. But the app runs on
            top of other people&apos;s infrastructure — Clerk handles sign-in, Vercel hosts the
            app and stores your photos and videos, Neon holds the database — so some of your
            information necessarily passes through their systems too. This document exists so
            that&apos;s on the record, and so everyone&apos;s expectations (including mine) are
            clear before anyone posts anything embarrassing.
          </p>
        </div>

        <section>
          <h2>1. Scope</h2>
          <p>
            These Terms govern your use of Brapids (also called &ldquo;Brat Olympics&rdquo;), a
            private web app for playing a season-long challenge-and-voting game with a closed
            group of invited players. By accepting an invite and signing in, you agree to these
            Terms and to the game rules published in the app.
          </p>
          <p>
            Brapids is a personal, non-commercial project. It is not operated by a company.
            &ldquo;We,&rdquo; &ldquo;us,&rdquo; and &ldquo;the operator&rdquo; in this document
            mean Nicolas Arcelin, who built and runs it.
          </p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <ul>
            <li>You must be 18 or older to use Brapids.</li>
            <li>
              Access is invite-only. There is no public sign-up — you need an invitation from
              the operator to create an account.
            </li>
            <li>
              You&apos;re responsible for making sure your use of the app complies with any laws
              that apply to you where you live.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Your account</h2>
          <p>
            Accounts are created and authenticated through Clerk, a third-party identity
            provider. Your sign-in credentials and session are managed by Clerk, not stored
            directly by Brapids.
          </p>
          <ul>
            <li>One account per person. Don&apos;t share your login or post on someone else&apos;s behalf.</li>
            <li>Keep your credentials secure. You&apos;re responsible for activity that happens under your account.</li>
            <li>If your invite is revoked or your account is removed, your access to the app ends, subject to Section 9.</li>
          </ul>
        </section>

        <section>
          <h2>4. Playing the game</h2>
          <p>
            Each week, objectives drop across three tiers. You submit proof (a photo or a short
            video recorded in the app), submissions stay hidden until the window closes, then
            everyone votes and points are awarded. The full gameplay rules — how points are
            scored, how voting works, what counts as a valid entry — live in the app&apos;s rules
            page, not in this legal document, and may change between seasons at the
            operator&apos;s discretion.
          </p>
          <p>
            Where the gameplay rules and these Terms overlap on account access, data, or
            conduct, these Terms control.
          </p>
        </section>

        <section>
          <h2>5. What you submit</h2>
          <p>
            You keep ownership of the photos and videos you submit. By submitting them, you give
            the operator permission to store, process, and display that content to other invited
            players within the app, as required for the game to work — nothing more. Content is
            not published outside the private player group and is not sold, licensed, or used
            for any purpose beyond running the game, per the{' '}
            <Link href="/privacy-policy">Privacy Policy</Link>.
          </p>
          <ul>
            <li>Only submit content you have the right to share, and don&apos;t feature other people in it without their okay.</li>
            <li>Don&apos;t submit anything illegal, or anything that could genuinely put someone at risk (yourself included).</li>
            <li>The operator can remove a submission that violates these Terms.</li>
          </ul>
        </section>

        <section>
          <h2>6. House rules</h2>
          <p>This is a game among friends, so the bar is common sense rather than a long legal list:</p>
          <ul>
            <li>Don&apos;t harass, impersonate, or try to access another player&apos;s account.</li>
            <li>Don&apos;t try to break, scrape, or abuse the app outside normal play.</li>
            <li>
              Vote trading is explicitly allowed — if you and someone else agree to rank each
              other favorably, that&apos;s a house rule, not a violation. Voting for yourself is
              not allowed and is blocked server-side.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Who else touches this</h2>
          <p>Brapids is built on hosted infrastructure the operator doesn&apos;t own or control:</p>
          <ul>
            <li><b>Clerk</b> — authentication and account sign-in</li>
            <li><b>Vercel</b> — application hosting, plus file storage (Vercel Blob) for the photos and videos you submit</li>
            <li><b>Neon</b> — the Postgres database that stores game data, provisioned through Vercel</li>
          </ul>
          <p>
            Your use of Brapids means your data passes through these providers&apos;
            infrastructure under their own terms and privacy policies, in addition to this one.
            See the <Link href="/privacy-policy">Privacy Policy</Link> for what each one sees.
          </p>
        </section>

        <section>
          <h2>8. No promises about uptime</h2>
          <p>
            Brapids is a side project, provided &ldquo;as is,&rdquo; with no uptime guarantee, no
            support SLA, and no warranty of any kind. It can go down, change, or be discontinued
            at any time, including mid-season. The operator will try to give players a heads-up
            before anything that affects an in-progress season, but isn&apos;t obligated to.
          </p>
        </section>

        <section>
          <h2>9. Ending access</h2>
          <p>
            The operator can suspend or remove your access at any time, for any reason,
            including violating these Terms or the house rules. You can ask to have your account
            and data removed at any time — see Contact below.
          </p>
        </section>

        <section>
          <h2>10. Liability</h2>
          <p>
            To the fullest extent allowed by law, the operator isn&apos;t liable for any
            damages, losses, or injuries — including from the physical challenges the game asks
            you to attempt — arising from your use of Brapids. Do the objectives at your own
            judgment and risk. This is a hobby project run by one person, not a company with a
            legal or insurance backstop.
          </p>
        </section>

        <section>
          <h2>11. Changes to these Terms</h2>
          <p>
            These Terms may be updated between seasons. Meaningful changes will be flagged in
            the app or communicated directly to players. Continuing to use Brapids after a
            change means you accept the update.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            Questions, requests, or concerns about these Terms go straight to the person who
            runs this: <a href="mailto:arcelin.nicolas@gmail.com">arcelin.nicolas@gmail.com</a>.
          </p>
        </section>

        <p className="doc-footer">
          Brapids Terms of Service — see also the{' '}
          <Link href="/privacy-policy">Privacy Policy</Link> for how your data is handled.
        </p>
      </div>
    </main>
  )
}
