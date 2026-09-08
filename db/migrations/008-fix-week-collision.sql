-- Weeks 3 and 4 both dropped on 2026-09-27, fourteen minutes apart.
--
-- getCurrentWeek picks the most recently dropped week
-- (ORDER BY drops_at DESC, number DESC LIMIT 1), so week 4 would have
-- permanently shadowed week 3 from 20:45 that day: week 3 live for fourteen
-- minutes, then its three objectives unreachable for the rest of the season,
-- with no error raised anywhere.
--
-- Recomputes weeks 4-8 from week 3 on a clean 7-day cadence, preserving the
-- existing 6-day submission window and 1-day voting window. Idempotent: it
-- derives every value from week 3 rather than shifting by an offset, so
-- running it twice changes nothing the second time.
--
-- These remain PLACEHOLDER dates. The season start is not pinned yet; this
-- only removes the collision.

UPDATE weeks w
SET
  drops_at             = base.drops_at + (w.number - 3) * INTERVAL '7 days',
  submissions_close_at = base.drops_at + (w.number - 3) * INTERVAL '7 days' + INTERVAL '6 days',
  voting_closes_at     = base.drops_at + (w.number - 3) * INTERVAL '7 days' + INTERVAL '7 days'
FROM (
  SELECT w3.drops_at, w3.season_id
  FROM weeks w3
  JOIN seasons s ON s.id = w3.season_id AND s.is_active
  WHERE w3.number = 3
) AS base
WHERE w.season_id = base.season_id
  AND w.number BETWEEN 4 AND 8;
