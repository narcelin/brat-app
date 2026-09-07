-- 24 placeholder objectives across 8 weeks.
--
-- Every one is doable at home, alone, in a few minutes, and is safe. That is
-- deliberate: the point of this set is to test whether people will post at all,
-- so nothing should block a submission on leaving the house, finding a
-- stranger, or waiting for the right moment. Draft day replaces all of it.
--
-- Idempotent via ON CONFLICT DO NOTHING (see the unique constraints on
-- seasons.name, weeks(season_id, number) and objectives(week_id, title)).
-- This must never DELETE FROM objectives: submissions.objective_id is
-- ON DELETE CASCADE, and players have real submissions against these rows.

INSERT INTO seasons (name, is_active) VALUES ('Season 1', true)
ON CONFLICT (name) DO NOTHING;

-- Week 1 is already open. Weeks 2-8 drop a week apart after it.
INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
VALUES (
  (SELECT id FROM seasons WHERE is_active LIMIT 1),
  1,
  now() - interval '1 day',
  now() + interval '5 days',
  now() + interval '6 days'
)
ON CONFLICT (season_id, number) DO NOTHING;

INSERT INTO weeks (season_id, number, drops_at, submissions_close_at, voting_closes_at)
SELECT (SELECT id FROM seasons WHERE is_active LIMIT 1), n,
       now() + ((n - 1) || ' weeks')::interval,
       now() + (((n - 1) || ' weeks')::interval + interval '6 days'),
       now() + (((n - 1) || ' weeks')::interval + interval '7 days')
FROM generate_series(2, 8) AS n
ON CONFLICT (season_id, number) DO NOTHING;

INSERT INTO objectives (week_id, title, description, tier)
SELECT w.id, o.title, o.description, o.tier
FROM weeks w
JOIN seasons se ON se.id = w.season_id AND se.is_active
JOIN (VALUES
  (1, 'Show us your fridge',        'No tidying it first. Open, pan slowly, accept judgement.', 'easy'),
  (1, 'Handstand against a wall',   'Hold it for five seconds. Counting out loud is encouraged.', 'hard'),
  (1, 'Shower fully clothed',       'Get in. Get wet. Look directly at the camera.',            'unhinged'),

  (2, 'Alphabet backwards',         'One take. Z to A. No stopping to think.',                  'easy'),
  (2, 'Juggle three kitchen things','Three catches minimum. Breakables raise the stakes.',      'hard'),
  (2, 'Wear every top you own',     'All of them. At once. Then try to sit down.',              'unhinged'),

  (3, 'Read your last text out loud','Most recent one you sent. No scrolling for a safe one.',  'easy'),
  (3, 'Twenty push-ups',            'Unbroken, on camera, all the way down.',                   'hard'),
  (3, 'Monologue to a houseplant',  'Full dramatic breakup. Commit to it.',                     'unhinged'),

  (4, 'Balance a spoon on your nose','Hands off for three seconds.',                            'easy'),
  (4, 'Build a tower from your desk','Everything on it. One structure. It must stand alone.',   'hard'),
  (4, 'Serenade your reflection',   'Full volume, full eye contact with yourself.',             'unhinged'),

  (5, 'Oldest thing in your fridge','Find it. Read the date aloud. Do not eat it.',             'easy'),
  (5, 'Cartwheel indoors',          'Break nothing. Breaking something is its own reward.',     'hard'),
  (5, 'Face in a bowl of water',    'Ten seconds. Come up smiling.',                            'unhinged'),

  (6, 'Impression of your ringtone','Mouth only. It has to be recognisable.',                   'easy'),
  (6, 'A hat from your recycling',  'Build it, wear it, walk around in it.',                    'hard'),
  (6, 'Thirty seconds of dancing',  'No music. Silence makes it worse. That is the point.',     'unhinged'),

  (7, 'Show us your sock drawer',   'Unedited. Explain the worst pair.',                        'easy'),
  (7, 'A minute of a film, memorised','No script, no prompts, one continuous minute.',          'hard'),
  (7, 'Interview yourself',         'You are your own biggest fan. Ask the tough questions.',   'unhinged'),

  (8, 'Bedsheet as a cape',         'Worn for the entire video. No explanation given.',         'easy'),
  (8, 'Forward roll on the carpet', 'Stick the landing. Feet, not face.',                       'hard'),
  (8, 'Narrate your fridge',        'Nature documentary voice. Full David Attenborough.',       'unhinged')
) AS o(week_number, title, description, tier) ON o.week_number = w.number
ON CONFLICT (week_id, title) DO NOTHING;
