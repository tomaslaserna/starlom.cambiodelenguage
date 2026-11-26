CREATE SCHEMA starlim_arca;

REVOKE ALL ON SCHEMA starlim_arca FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA starlim_arca TO starlim_app;

CREATE TABLE starlim_arca.wsaa_tickets (
  cache_key text PRIMARY KEY,
  encrypted_ticket bytea NOT NULL,
  expires_at timestamptz NOT NULL
);

REVOKE ALL ON TABLE starlim_arca.wsaa_tickets FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE starlim_arca.wsaa_tickets TO starlim_app;
