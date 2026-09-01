DROP INDEX IF EXISTS "weekly_league_awards_week_start_student_id_award_type_key";

CREATE INDEX IF NOT EXISTS "weekly_league_awards_week_start_student_id_award_type_idx"
  ON "weekly_league_awards"("week_start", "student_id", "award_type");
