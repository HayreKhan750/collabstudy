-- CollabStudy PostgreSQL Initialization Script

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create initial database (if not exists)
-- The database is already created via POSTGRES_DB env variable

-- Set timezone
SET timezone = 'UTC';

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'CollabStudy database initialized successfully!';
  RAISE NOTICE 'Extensions enabled: uuid-ossp, vector, pg_trgm';
END $$;
