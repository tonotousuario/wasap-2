ALTER TABLE conversations ADD COLUMN membership_revision bigint NOT NULL DEFAULT 0;

CREATE FUNCTION bump_membership_revision() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE conversations SET membership_revision = membership_revision + 1 WHERE id = NEW.conversation_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations SET membership_revision = membership_revision + 1 WHERE id = OLD.conversation_id;
    ELSE
        UPDATE conversations SET membership_revision = membership_revision + 1 WHERE id IN (NEW.conversation_id, OLD.conversation_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER conversation_members_revision
AFTER INSERT OR UPDATE OR DELETE ON conversation_members
FOR EACH ROW EXECUTE FUNCTION bump_membership_revision();
