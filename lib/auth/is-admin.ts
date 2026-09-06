import { currentUser } from '@clerk/nextjs/server'

/** Admin is read from Clerk's publicMetadata and checked server-side only.
 *  A client claim is worthless here: forcing a week's state decides when proof
 *  is revealed to everyone, so it must never be something a request can assert
 *  about itself. */
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser()
  return user?.publicMetadata?.role === 'admin'
}
