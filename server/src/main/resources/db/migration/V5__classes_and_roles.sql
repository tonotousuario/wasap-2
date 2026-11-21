-- Roles: every existing user becomes a student; the first admin is assigned from the console.
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'teacher', 'student'));

-- A class is a group conversation with its own attendance; its owner is the responsible teacher.
ALTER TABLE conversations ADD COLUMN is_class boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD CONSTRAINT class_is_group CHECK (NOT is_class OR kind = 'GROUP');

-- NULL class = the general door: all existing movements stay there. No membership FK, so
-- removing a student keeps their past attendance in the class.
ALTER TABLE attendance_events ADD COLUMN class_id uuid REFERENCES conversations(id);
CREATE INDEX attendance_user_class_seq ON attendance_events(user_id, class_id, seq DESC);
CREATE INDEX attendance_class_seq ON attendance_events(class_id, seq DESC) WHERE class_id IS NOT NULL;
