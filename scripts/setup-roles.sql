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
END $$;

-- Grant database connection and create privileges
GRANT CONNECT ON DATABASE innkeeper TO innkeeper_owner, innkeeper_app, innkeeper_readonly;
GRANT ALL PRIVILEGES ON DATABASE innkeeper TO innkeeper_owner;
ALTER DATABASE innkeeper OWNER TO innkeeper_owner;
