-- Relaxes the submissions duration ceiling to match validateTrim.
--
-- The recorder auto-stops AT MAX_RECORDING_SECONDS, so a full-length take's
-- container reports a fraction over it, and MediaRecorder reports durations
-- that are simply wrong on some devices. An exact 60 here refused a
-- legitimate max-length recording at the last possible moment — after the
-- media had already been uploaded to Blob — turning a submission into a 500.
--
-- The ceiling is not really what protects the app: MAX_UPLOAD_BYTES is
-- checked against the stored blob's actual size, and trim_end - trim_start
-- still caps what anyone has to watch at 15s. duration_seconds is
-- client-reported and was never trustworthy; this keeps it as a sanity bound
-- rather than a tripwire on the boundary.
--
-- 65 = MAX_RECORDING_SECONDS (60) + RECORDING_TOLERANCE_SECONDS (5) in
-- lib/domain/trim.ts. Keep the two in step.

-- The original lived inline in CREATE TABLE, so Postgres named it from the
-- first column it mentions: submissions_trim_check. Dropping only the name
-- this migration creates leaves that one in force, and BOTH would apply —
-- the stricter 60 would still refuse the recording this migration exists to
-- allow. Verified by name against production and the test branch before
-- writing this.
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_trim_check;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_media_shape;

ALTER TABLE submissions ADD CONSTRAINT submissions_media_shape CHECK (
  (media_type = 'photo' AND trim_start IS NULL AND trim_end IS NULL)
  OR
  (media_type = 'video' AND trim_start IS NOT NULL AND trim_end IS NOT NULL
   AND trim_start >= 0 AND trim_end > trim_start
   AND trim_end - trim_start <= 15
   AND duration_seconds IS NOT NULL AND duration_seconds <= 65
   AND trim_end <= duration_seconds)
);
