CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS master_keys (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  name TEXT,
  key_masked TEXT NOT NULL,
  ciphertext_b64 TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  auth_tag_b64 TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subkeys (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  provider TEXT NOT NULL,
  monthly_token_limit INTEGER DEFAULT 100000,
  requests_per_minute_limit INTEGER DEFAULT 2,
  tokens_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  spend_limit_usd NUMERIC(12,4),
  max_requests INTEGER DEFAULT 5000,
  request_count INTEGER DEFAULT 0,
  allowed_models JSONB DEFAULT '"all"'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY,
  subkey_id TEXT NOT NULL,
  subkey_name TEXT,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  status TEXT,
  source TEXT DEFAULT 'external',
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subkeys_token_hash ON subkeys(token_hash);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
