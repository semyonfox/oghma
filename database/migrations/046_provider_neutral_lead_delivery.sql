-- Keep lead delivery state independent of the notification provider.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'marketing_leads'
          AND column_name = 'forwarded_to_web3forms'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'marketing_leads'
          AND column_name = 'notification_delivered'
    ) THEN
        ALTER TABLE app.marketing_leads
            RENAME COLUMN forwarded_to_web3forms TO notification_delivered;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'marketing_leads'
          AND column_name = 'forward_error'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'marketing_leads'
          AND column_name = 'notification_error'
    ) THEN
        ALTER TABLE app.marketing_leads
            RENAME COLUMN forward_error TO notification_error;
    END IF;
END $$;
