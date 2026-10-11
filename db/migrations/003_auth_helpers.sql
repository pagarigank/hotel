-- 003_auth_helpers.sql: Security definer functions for platform-level authentication and session lookup

CREATE OR REPLACE FUNCTION app.get_user_tenants(p_user_id uuid)
RETURNS TABLE (tenant_id uuid, name text, slug text, plan text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.tenant_id, t.name, t.slug, t.plan, t.active
  FROM memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = p_user_id AND m.active = true AND t.active = true;
$$;

GRANT EXECUTE ON FUNCTION app.get_user_tenants(uuid) TO innkeeper_app;

CREATE OR REPLACE FUNCTION app.get_session_by_token(p_token_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, user_id uuid, expires_at timestamptz, email text, name text, active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.tenant_id, s.user_id, s.expires_at, u.email, u.name, u.active
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.refresh_token_hash = p_token_hash;
$$;

GRANT EXECUTE ON FUNCTION app.get_session_by_token(text) TO innkeeper_app;

CREATE OR REPLACE FUNCTION app.delete_session_by_token(p_token_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM sessions WHERE refresh_token_hash = p_token_hash;
$$;

GRANT EXECUTE ON FUNCTION app.delete_session_by_token(text) TO innkeeper_app;
