-- ============================================================
-- PA MCP: OAuth tables (matching memory-mcp pattern)
-- ============================================================

-- ── OAuth Clients (Dynamic Client Registration) ─────────

CREATE TABLE mcp_oauth_clients (
  client_id                   TEXT PRIMARY KEY,
  client_secret_hash          TEXT,
  client_name                 TEXT,
  redirect_uris               JSONB NOT NULL DEFAULT '[]',
  grant_types                 TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token'],
  response_types              TEXT[] DEFAULT ARRAY['code'],
  scope                       TEXT DEFAULT 'mcp:tools',
  token_endpoint_auth_method  TEXT DEFAULT 'none',
  metadata                    JSONB DEFAULT '{}',
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ── Authorization Codes ─────────────────────────────────

CREATE TABLE mcp_oauth_authorization_codes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash             TEXT NOT NULL UNIQUE,
  client_id             TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  scopes                TEXT[] DEFAULT ARRAY['mcp:tools'],
  resource              TEXT,
  expires_at            TIMESTAMPTZ NOT NULL,
  used_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auth_codes_hash ON mcp_oauth_authorization_codes(code_hash);

-- ── Access & Refresh Tokens ─────────────────────────────

CREATE TABLE mcp_oauth_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_hash   TEXT NOT NULL UNIQUE,
  refresh_token_hash  TEXT NOT NULL UNIQUE,
  scopes              TEXT[] DEFAULT ARRAY['mcp:tools'],
  resource            TEXT,
  expires_at          TIMESTAMPTZ NOT NULL,
  refresh_expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  last_used_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tokens_access ON mcp_oauth_tokens(access_token_hash);
CREATE INDEX idx_tokens_refresh ON mcp_oauth_tokens(refresh_token_hash);
CREATE INDEX idx_tokens_user ON mcp_oauth_tokens(user_id);
