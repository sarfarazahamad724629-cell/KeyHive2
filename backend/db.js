'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');

function createPoolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const config = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'keyhive',
    user: process.env.PGUSER || 'postgres',
  };

  // Only set password when actually provided. Passing undefined triggers SCRAM errors.
  if (typeof process.env.PGPASSWORD === 'string' && process.env.PGPASSWORD.length > 0) {
    config.password = process.env.PGPASSWORD;
  }

  return config;
}

const pool = new Pool(createPoolConfig());

function requireMasterKey() {
  const keyB64 = process.env.KEYHIVE_MASTER_KEY_BASE64;
  if (!keyB64) {
    throw new Error('Missing KEYHIVE_MASTER_KEY_BASE64. Set it in your .env file.');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('KEYHIVE_MASTER_KEY_BASE64 must decode to exactly 32 bytes for AES-256-GCM.');
  }
  return key;
}

function encryptSecret(plaintext, aad = '') {
  const key = requireMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    key_version: 1,
    iv_b64: iv.toString('base64'),
    auth_tag_b64: authTag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64'),
  };
}

function decryptSecret(record, aad = '') {
  const key = requireMasterKey();
  const iv = Buffer.from(record.iv_b64, 'base64');
  const authTag = Buffer.from(record.auth_tag_b64, 'base64');
  const ciphertext = Buffer.from(record.ciphertext_b64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  try {
    await pool.query(`
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
        token_ciphertext_b64 TEXT,
        token_iv_b64 TEXT,
        token_auth_tag_b64 TEXT,
        token_key_version INTEGER,
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

      ALTER TABLE subkeys ADD COLUMN IF NOT EXISTS token_ciphertext_b64 TEXT;
      ALTER TABLE subkeys ADD COLUMN IF NOT EXISTS token_iv_b64 TEXT;
      ALTER TABLE subkeys ADD COLUMN IF NOT EXISTS token_auth_tag_b64 TEXT;
      ALTER TABLE subkeys ADD COLUMN IF NOT EXISTS token_key_version INTEGER;

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

      CREATE TABLE IF NOT EXISTS quota_requests (
        id UUID PRIMARY KEY,
        subkey_id UUID NOT NULL,
        request_type TEXT NOT NULL,
        amount TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    if (err && /client password must be a string/i.test(err.message || '')) {
      throw new Error(
        'PostgreSQL auth failed: set PGPASSWORD (or DATABASE_URL including password) to a non-empty string for SCRAM-enabled servers.'
      );
    }
    throw err;
  }
}

module.exports = {
  query,
  initDb,
  encryptSecret,
  decryptSecret,
};
