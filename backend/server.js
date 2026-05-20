'use strict';

require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const { randomUUID, createHash } = require('crypto');
const { createClient } = require('redis');
const { query, initDb, encryptSecret } = require('./db');

const DEFAULT_RPM_LIMIT = Number(process.env.RATE_LIMIT_DEFAULT_PER_MIN || 2);
const redis = createClient({ url: process.env.REDIS_URL });

fastify.register(require('@fastify/cors'), { origin: true });
fastify.register(require('@fastify/helmet'), { contentSecurityPolicy: false });

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function maskKey(apiKey) {
  return apiKey.slice(0, 7) + '••••••••' + apiKey.slice(-4);
}

async function rateLimitBySubkey(subkeyId, limit = DEFAULT_RPM_LIMIT) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowSec = 60;
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const redisKey = `rl:subkey:${subkeyId}:${windowStart}`;

  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);

  const remaining = Math.max(limit - count, 0);
  const reset = windowStart + windowSec;
  return { count, remaining, reset, limit, allowed: count <= limit };
}

fastify.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

fastify.get('/api/master-keys', async () => {
  const { rows } = await query('SELECT id, provider, name, key_masked, key_version, created_at, updated_at FROM master_keys ORDER BY created_at DESC');
  return rows;
});

fastify.post('/api/master-keys', async (req, reply) => {
  const { provider, api_key, name } = req.body || {};
  if (!provider || !api_key) return reply.code(400).send({ error: 'provider and api_key required' });

  const encrypted = encryptSecret(api_key, provider);
  const params = [randomUUID(), provider, name || provider, maskKey(api_key), encrypted.ciphertext_b64, encrypted.iv_b64, encrypted.auth_tag_b64, encrypted.key_version];
  await query(
    `INSERT INTO master_keys (id, provider, name, key_masked, ciphertext_b64, iv_b64, auth_tag_b64, key_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (provider)
     DO UPDATE SET name = EXCLUDED.name, key_masked = EXCLUDED.key_masked, ciphertext_b64 = EXCLUDED.ciphertext_b64, iv_b64 = EXCLUDED.iv_b64, auth_tag_b64 = EXCLUDED.auth_tag_b64, key_version = EXCLUDED.key_version, updated_at = NOW()`,
    params,
  );

  return { success: true };
});

fastify.post('/api/subkeys', async (req, reply) => {
  const { name, provider, token } = req.body || {};
  if (!name || !provider || !token) return reply.code(400).send({ error: 'name, provider, token required' });
  const token_hash = hashToken(token);
  const token_prefix = token.slice(0, 10);
  const id = randomUUID();
  await query(
    `INSERT INTO subkeys (id, name, token_hash, token_prefix, provider, requests_per_minute_limit)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, name, token_hash, token_prefix, provider, DEFAULT_RPM_LIMIT],
  );
  return { id, name, provider, token_prefix, requests_per_minute_limit: DEFAULT_RPM_LIMIT };
});

fastify.post('/v1/chat/completions', async (req, reply) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return reply.code(401).send({ error: { message: 'Missing Authorization header.', type: 'auth_error' } });

  const tokenHash = hashToken(bearer);
  const { rows } = await query('SELECT id, name, status, requests_per_minute_limit FROM subkeys WHERE token_hash = $1', [tokenHash]);
  const subkey = rows[0];
  if (!subkey) return reply.code(401).send({ error: { message: 'Invalid subkey.', type: 'auth_error' } });
  if (subkey.status !== 'active') return reply.code(403).send({ error: { message: `Subkey is ${subkey.status}.`, type: 'permission_error' } });

  const result = await rateLimitBySubkey(subkey.id, Number(subkey.requests_per_minute_limit || DEFAULT_RPM_LIMIT));
  reply.header('X-RateLimit-Limit', String(result.limit));
  reply.header('X-RateLimit-Remaining', String(result.remaining));
  reply.header('X-RateLimit-Reset', String(result.reset));

  if (!result.allowed) {
    const retryAfter = Math.max(result.reset - Math.floor(Date.now() / 1000), 1);
    reply.header('Retry-After', String(retryAfter));
    return reply.code(429).send({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again later.', retry_after_seconds: retryAfter });
  }

  return { ok: true, message: 'Proxy stub ready', subkey_id: subkey.id };
});

async function start() {
  await redis.connect();
  console.log('✅ Redis connected');

  await initDb();
  console.log('✅ PostgreSQL connected');

  const port = Number(process.env.PORT || 8787);

  await fastify.listen({
    port,
    host: '0.0.0.0'
  });

  console.log(`🚀 Server running on http://localhost:${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
