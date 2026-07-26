-- The public contact form now asks only for the details needed to respond.
-- Existing lead records retain their role values; new short-form submissions may not have one.

ALTER TABLE app.marketing_leads
    ALTER COLUMN role DROP NOT NULL;
