SELECT EXISTS (SELECT 1 FROM "replay_experiments" LIMIT 1) as table_exists;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'replay_experiments' ORDER BY ordinal_position;
