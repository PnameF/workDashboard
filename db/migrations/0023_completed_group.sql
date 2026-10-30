INSERT OR IGNORE INTO task_groups(id,name,color) VALUES('done','Completed','#64aa91');

-- A renamed/overridden native Status column still represents task status.
UPDATE tasks SET status=CASE json_extract(custom,'$."view:status"')
 WHEN 'ยังไม่เริ่ม' THEN 0 WHEN 'กำลังทำ' THEN 1 WHEN 'เสร็จแล้ว' THEN 2 WHEN 'ติดปัญหา' THEN 3 ELSE status END
WHERE (SELECT json_extract(layout,'$.overrides.status.type') FROM board_settings WHERE id=1) IN ('status','select')
 AND json_type(custom,'$."view:status"')='text';

CREATE TRIGGER task_children_follow_group AFTER UPDATE OF group_id ON tasks
WHEN NEW.parent_id IS NULL AND NEW.group_id IS NOT OLD.group_id
BEGIN
 UPDATE tasks SET group_id=NEW.group_id WHERE parent_id=NEW.id AND group_id IS NOT NEW.group_id;
END;

CREATE TRIGGER task_completed_insert AFTER INSERT ON tasks
WHEN NEW.parent_id IS NULL AND NEW.status=2 AND NEW.archived_at IS NULL
BEGIN
 UPDATE tasks SET group_id='done',sort_order=(SELECT COALESCE(MAX(COALESCE(sort_order,rowid*1024)),0)+1024 FROM tasks WHERE group_id='done' AND parent_id IS NULL AND id<>NEW.id) WHERE id=NEW.id AND group_id IS NOT 'done';
 UPDATE tasks SET group_id='done' WHERE parent_id=NEW.id AND group_id IS NOT 'done';
 UPDATE board_settings SET layout=json_set(layout,'$.hiddenGroups',json((SELECT json_group_array(value) FROM json_each(layout,'$.hiddenGroups') WHERE value<>'done'))) WHERE id=1;
END;

CREATE TRIGGER task_completed_update AFTER UPDATE OF status,archived_at ON tasks
WHEN NEW.parent_id IS NULL AND NEW.status=2 AND NEW.archived_at IS NULL
BEGIN
 UPDATE tasks SET group_id='done',sort_order=(SELECT COALESCE(MAX(COALESCE(sort_order,rowid*1024)),0)+1024 FROM tasks WHERE group_id='done' AND parent_id IS NULL AND id<>NEW.id) WHERE id=NEW.id AND group_id IS NOT 'done';
 UPDATE tasks SET group_id='done' WHERE parent_id=NEW.id AND group_id IS NOT 'done';
 UPDATE board_settings SET layout=json_set(layout,'$.hiddenGroups',json((SELECT json_group_array(value) FROM json_each(layout,'$.hiddenGroups') WHERE value<>'done'))) WHERE id=1;
END;

-- Apply the rule to already completed parent tasks, including their children.
UPDATE tasks SET status=status WHERE parent_id IS NULL AND status=2 AND archived_at IS NULL;
