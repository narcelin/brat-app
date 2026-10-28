/** The posted / done tick. Drawn rather than a ✓ character so it has the same
 *  weight on every platform's font and inherits the text colour it sits in. */
export function Check({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="check">
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
