ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD CONSTRAINT users_session_version_nonnegative CHECK (session_version >= 0);
CREATE FUNCTION bump_user_session_version() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.crm_student_id IS DISTINCT FROM OLD.crm_student_id
     OR NEW.crm_teacher_id IS DISTINCT FROM OLD.crm_teacher_id
     OR NEW.external_link_status IS DISTINCT FROM OLD.external_link_status THEN
    NEW.session_version := OLD.session_version + 1;
  ELSIF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION 'Session version cannot decrease';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_session_version BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION bump_user_session_version();
