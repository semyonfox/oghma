-- two-phase discovery + processing for Canvas imports
-- discovery creates canvas_imports rows (pending) with folder context;
-- per-file processors read parent_folder_id and s3_prefix instead of reconstructing them

ALTER TABLE app.canvas_imports
    ADD COLUMN IF NOT EXISTS parent_folder_id UUID,
    ADD COLUMN IF NOT EXISTS s3_prefix TEXT;
