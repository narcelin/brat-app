-- Placeholder objectives so the app has real content to look at before draft
-- day happens. These are NOT the real season: draft day is where the group
-- ranks objectives into tiers, and these tiers are guesses.
--
-- Idempotent: seasons.name and (week_id, title) are both unique, so re-running
-- changes nothing.

INSERT INTO seasons (name, is_active) VALUES ('Season 1', true)
ON CONFLICT (name) DO NOTHING;

-- Weeks 2 and 3 exist so the timeline has somewhere to go. Week 1 already
-- exists and is open; these drop later so they stay PENDING for now.
INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
SELECT (SELECT id FROM seasons WHERE is_active LIMIT 1), n,
       now() + (n || ' weeks')::interval,
       now() + ((n || ' weeks')::interval + interval '6 days'),
       now() + ((n || ' weeks')::interval + interval '7 days')
FROM generate_series(2, 3) AS n
ON CONFLICT (season_id, number) DO NOTHING;

INSERT INTO objectives (week_id, title, description, tier)
SELECT w.id, o.title, o.description, o.tier
FROM weeks w
JOIN (VALUES
  (1, 'Jump in a bush',       'Fully airborne. Fully in the bush.',                    'easy'),
  (1, 'Tag Mikey',            'Find him. Tag him. Get it on camera.',                  'hard'),
  (1, 'Shoey',                'You know what you did.',                                'unhinged'),

  (2, 'Compliment a stranger','Genuine one. Their reaction is the proof.',             'easy'),
  (2, 'Order in an accent',   'Whole transaction. No breaking.',                       'hard'),
  (2, 'Sprint through a fountain', 'Clothed. Fully through, not around.',              'unhinged'),

  (3, 'Wear it inside out',   'A full day, in public, no explaining yourself.',        'easy'),
  (3, 'Busk for one minute',  'Anywhere public. Earnings optional, footage mandatory.','hard'),
  (3, 'Serenade the group chat', 'Live. Unaccompanied. Full verse.',                   'unhinged')
) AS o(week_number, title, description, tier) ON o.week_number = w.number
JOIN seasons se ON se.id = w.season_id AND se.is_active
ON CONFLICT (week_id, title) DO NOTHING;
