INSERT INTO seasons (name, is_active) VALUES ('Season 1', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
VALUES (
  (SELECT id FROM seasons WHERE is_active LIMIT 1),
  1,
  now() - interval '1 day',
  now() + interval '5 days',
  now() + interval '6 days'
)
ON CONFLICT (season_id, number) DO NOTHING;

INSERT INTO objectives (week_id, title, description, tier)
SELECT w.id, o.title, o.description, o.tier
FROM weeks w,
  (VALUES
    ('Jump in a bush', 'Fully airborne. Fully in the bush.', 'easy'),
    ('Tag Mikey', 'Find him. Tag him. Get it on camera.', 'hard'),
    ('Shoey', 'You know what you did.', 'unhinged')
  ) AS o(title, description, tier)
WHERE w.number = 1
ON CONFLICT (week_id, title) DO NOTHING;
