'use strict';

require('dotenv').config();
const fastify = require('fastify')({ logger: false });
const { randomUUID, createHash } = require('crypto');
const { createClient } = require('redis');
const { query, initDb, encryptSecret, decryptSecret } = require('./db');

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


fastify.get('/api/subkeys', async () => {
  const { rows } = await query(`
    SELECT id, name, token_prefix, token_ciphertext_b64, token_iv_b64, token_auth_tag_b64, token_key_version,
           provider, monthly_token_limit, requests_per_minute_limit,
           tokens_used, status, spend_limit_usd, max_requests, request_count, allowed_models,
           EXTRACT(EPOCH FROM expires_at)::bigint AS expires_at,
           EXTRACT(EPOCH FROM created_at)::bigint AS created_at
    FROM subkeys
    ORDER BY created_at DESC
  `);

  return rows.map((row) => {
    let token = null;
    if (row.token_ciphertext_b64 && row.token_iv_b64 && row.token_auth_tag_b64) {
      try {
        token = decryptSecret({
          ciphertext_b64: row.token_ciphertext_b64,
          iv_b64: row.token_iv_b64,
          auth_tag_b64: row.token_auth_tag_b64,
        }, `subkey:${row.id}`);
      } catch (_) {
        token = null;
      }
    }
    return { ...row, token };
  });
});

fastify.get('/api/analytics', async () => {
  const [{ rows: totals }, { rows: logs }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_requests, COALESCE(SUM(tokens_used), 0)::int AS total_tokens FROM request_logs`),
    query(`
      SELECT id, subkey_id, subkey_name, model, tokens_used, status, source, latency_ms,
             EXTRACT(EPOCH FROM created_at)::bigint AS created_at
      FROM request_logs
      ORDER BY created_at DESC
      LIMIT 200
    `),
  ]);

  const totalRequests = totals[0]?.total_requests || 0;
  const totalTokens = totals[0]?.total_tokens || 0;
  const avgLatency = logs.length
    ? Math.round(logs.reduce((sum, row) => sum + Number(row.latency_ms || 0), 0) / logs.length)
    : 0;

  const topModelsMap = new Map();
  for (const row of logs) {
    const model = row.model || 'unknown';
    topModelsMap.set(model, (topModelsMap.get(model) || 0) + 1);
  }
  const topModels = [...topModelsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([model, count]) => ({ model, count }));

  return { totalRequests, totalTokens, avgLatency, topModels, logs };
});

fastify.post('/api/subkeys', async (req, reply) => {
  const {
    name,
    provider,
    monthly_token_limit = 50000,
    max_requests = 5000,
    allowed_models = ['all'],
    spend_limit_usd = null,
    expires_in_days = null,
  } = req.body || {};

  if (!name || !provider) return reply.code(400).send({ error: 'name and provider required' });

  const token = `sk-kg-${randomUUID().replace(/-/g, '')}`;
  const token_hash = hashToken(token);
  const token_prefix = token.slice(0, 12);
  const id = randomUUID();
  const encryptedToken = encryptSecret(token, `subkey:${id}`);
  const expiresAt = expires_in_days ? new Date(Date.now() + Number(expires_in_days) * 86400 * 1000) : null;

  await query(
    `INSERT INTO subkeys (
      id, name, token_hash, token_prefix, token_ciphertext_b64, token_iv_b64, token_auth_tag_b64, token_key_version,
      provider, monthly_token_limit, requests_per_minute_limit, spend_limit_usd, max_requests, allowed_models, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      name,
      token_hash,
      token_prefix,
      encryptedToken.ciphertext_b64,
      encryptedToken.iv_b64,
      encryptedToken.auth_tag_b64,
      encryptedToken.key_version,
      provider,
      Number(monthly_token_limit) || 50000,
      DEFAULT_RPM_LIMIT,
      spend_limit_usd,
      Number(max_requests) || 5000,
      JSON.stringify(allowed_models && allowed_models.length ? allowed_models : ['all']),
      expiresAt,
    ],
  );

  return { id, name, provider, token_prefix, token, requests_per_minute_limit: DEFAULT_RPM_LIMIT };
});


fastify.get('/api/models', async () => {
  return {
    data: [
      { id: 'gpt-4o-mini' },
      { id: 'gpt-4o' },
      { id: 'gpt-4.1-mini' },
      { id: 'gpt-4.1' },
    ],
  };
});

fastify.get('/api/quota-requests', async () => {
  const { rows } = await query(`
    SELECT q.id, q.subkey_id, s.name AS subkey_name, q.request_type, q.amount, q.note, q.status,
           EXTRACT(EPOCH FROM q.created_at)::bigint AS created_at
    FROM quota_requests q
    LEFT JOIN subkeys s ON s.id = q.subkey_id
    ORDER BY q.created_at DESC
  `);
  return rows;
});

fastify.post('/api/quota-requests', async (req, reply) => {
  const { subkey_id, request_type, amount = null, note = '' } = req.body || {};
  if (!subkey_id || !request_type) return reply.code(400).send({ error: 'subkey_id and request_type required' });
  const id = randomUUID();
  await query(
    `INSERT INTO quota_requests (id, subkey_id, request_type, amount, note, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, subkey_id, request_type, amount ? String(amount) : null, note, 'pending'],
  );
  return { success: true, id };
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

  const port = Number(process.env.PORT || 3001);

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
