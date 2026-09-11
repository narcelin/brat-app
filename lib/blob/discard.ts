// File: lib/blob/discard.ts
import { del } from '@vercel/blob'

/** Whether this deployment is allowed to delete from the blob store.
 *
 *  There is exactly one Vercel Blob store, and it does not branch. The
 *  database does: production, `dev`, `test`, and — once preview branching is
 *  on — one per preview deployment. So a non-production deployment can hold a
 *  row that references a file production is still serving, and deleting "its"
 *  media reaches into production's store and takes that file with it.
 *
 *  A preview branch is the sharp case, because it is a copy-on-write clone of
 *  production: every row in it is a real submission pointing at real media.
 *  Running the admin reset against a preview would delete the season's proof
 *  for everyone, permanently, from a deployment whose entire purpose is to be
 *  safe to experiment on.
 *
 *  Note which direction this fails. Refusing to delete leaves an orphan, and
 *  an orphan is reclaimable — scripts/sweep-orphan-blobs.mjs exists for
 *  exactly that, and computes the orphan set from production, so files a dev
 *  or preview deployment abandons get swept in the ordinary course. A wrongly
 *  deleted recording is gone: nobody is re-recording week 3.
 *
 *  Takes the env as an argument so it is testable without mutating the
 *  process. Defaults to reading it, so callers say what they mean. */
export function mayDeleteSharedMedia(vercelEnv = process.env.VERCEL_ENV): boolean {
  return vercelEnv === 'production'
}

/** Best-effort delete of a blob nothing should reference any more.
 *
 *  Best-effort in two senses: it does nothing at all outside production (see
 *  above), and a storage failure is swallowed rather than surfaced. Callers
 *  are cleaning up after an operation that has already committed, so a
 *  cleanup failure must never be reported as a failure of that operation.
 *
 *  Returns whether the file was actually deleted, which the admin reset
 *  reports back so a caller can tell "removed" from "left behind". */
export async function discardMedia(pathname: string): Promise<boolean> {
  if (!mayDeleteSharedMedia()) return false
  try {
    await del(pathname)
    return true
  } catch {
    // best-effort only
    return false
  }
}
