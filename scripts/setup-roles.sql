-- Create roles if they don't already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'innkeeper_owner') THEN
    CREATE ROLE innkeeper_owner WITH LOGIN PASSWORD 'innkeeper_owner_pass' CREATEDB;
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'innkeeper_app') THEN
    CREATE ROLE innkeeper_app WITH LOGIN PASSWORD 'innkeeper_app_pass' NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'innkeeper_readonly') THEN
    CREATE ROLE innkeeper_readonly WITH LOGIN PASSWORD 'innkeeper_ro_pass' NOBYPASSRLS;
  END IF;

  -- Dedicated outbox/background worker role. BYPASSRLS is required so it can
  -- discover and claim events across all tenants. It is NEVER used in request paths.
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'innkeeper_worker') THEN
    CREATE ROLE innkeeper_worker WITH LOGIN PASSWORD 'innkeeper_worker_pass' BYPASSRLS;
  END IF;
END $$;

-- Grant database connection and create privileges
GRANT CONNECT ON DATABASE innkeeper TO innkeeper_owner, innkeeper_app, innkeeper_readonly, innkeeper_worker;
GRANT ALL PRIVILEGES ON DATABASE innkeeper TO innkeeper_owner;
ALTER DATABASE innkeeper OWNER TO innkeeper_owner;
