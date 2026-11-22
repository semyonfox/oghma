-- restore the primary file for notes created through the old upload-into-note path
UPDATE app.notes n
SET s3_key = a.s3_key
FROM app.attachments a
WHERE n.s3_key IS NULL
  AND n.is_folder = FALSE
  AND a.note_id = n.note_id
  AND a.user_id = n.user_id
  AND (SELECT count(*) FROM app.attachments x WHERE x.note_id = n.note_id) = 1
  AND lower(substring(n.title from '\.([A-Za-z0-9]+)$'))
      = lower(substring(a.s3_key from '\.([A-Za-z0-9]+)$'))
  AND lower(substring(a.s3_key from '\.([A-Za-z0-9]+)$')) NOT IN ('md', 'markdown');
