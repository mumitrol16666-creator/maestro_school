BEGIN;
-- Preserve historical results and IDs. All future attempts must use a session and personal sector.
ALTER TABLE sector_exam_programs ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE sector_exam_sessions ALTER COLUMN created_by_id DROP NOT NULL;

DO $$
DECLARE old_exam RECORD; program_id uuid; saved_session_id uuid; tasks jsonb; snapshot jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM sector_exams WHERE session_id IS NULL AND status NOT IN ('completed','cancelled')) THEN
    RAISE EXCEPTION 'Unfinished exams without a session must be reviewed before switching the exam rule';
  END IF;
  FOR old_exam IN SELECT e.*, COALESCE(t.number,p.sequence) AS sector_number
    FROM sector_exams e JOIN learning_plans p ON p.id=e.plan_id
    LEFT JOIN sector_templates t ON t.id=p.template_step_id WHERE e.session_id IS NULL
  LOOP
    program_id:=gen_random_uuid(); saved_session_id:=gen_random_uuid();
    SELECT COALESCE(jsonb_agg(jsonb_build_object('title',title,'criteria',COALESCE(criteria,'')) ORDER BY position),'[]'::jsonb)
      INTO tasks FROM sector_exam_items WHERE exam_id=old_exam.id;
    snapshot:=jsonb_build_object('title',COALESCE(old_exam.program_title_snapshot,'Экзамен сектора '||old_exam.sector_number),
      'directionId',old_exam.direction_id,'sectorNumber',old_exam.sector_number,'durationMinutes',15,'items',tasks);
    INSERT INTO sector_exam_programs(id,direction_id,sector_number,title,duration_minutes,items,revision,archived_at,created_by_id,created_at,updated_at)
      VALUES(program_id,old_exam.direction_id,old_exam.sector_number,snapshot->>'title',15,tasks,1,NOW(),old_exam.created_by_id,old_exam.created_at,NOW());
    INSERT INTO sector_exam_sessions(id,program_id,program_revision,title,program_snapshot,request_key,request_fingerprint,created_by_id,created_at)
      VALUES(saved_session_id,program_id,1,snapshot->>'title',snapshot,gen_random_uuid(),md5(old_exam.id::text),old_exam.created_by_id,old_exam.created_at);
    UPDATE sector_exams SET session_id=saved_session_id WHERE id=old_exam.id;
  END LOOP;
END $$;
ALTER TABLE sector_exams ALTER COLUMN session_id SET NOT NULL;

CREATE FUNCTION require_session_personal_exam() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM learning_plans p WHERE p.id=NEW.plan_id
    AND p.crm_student_id=NEW.crm_student_id AND p.crm_group_id IS NULL AND p.direction_id=NEW.direction_id) THEN
    RAISE EXCEPTION 'An exam participant must have their own matching personal sector';
  END IF;
  IF NOT NEW.requires_readiness_confirmation THEN RAISE EXCEPTION 'Every exam requires confirmed readiness'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER personal_exam_participant BEFORE INSERT ON sector_exams
  FOR EACH ROW EXECUTE FUNCTION require_session_personal_exam();

CREATE FUNCTION require_explicit_exam_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind::text <> 'custom' OR NEW.topic_id IS NOT NULL THEN
    RAISE EXCEPTION 'New exam tasks are saved explicitly and are independent of sector materials';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER explicit_exam_task BEFORE INSERT ON sector_exam_items
  FOR EACH ROW EXECUTE FUNCTION require_explicit_exam_task();

COMMIT;
