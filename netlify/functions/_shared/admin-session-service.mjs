import { getStore } from '@netlify/blobs';
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  hmac256,
  intEnv,
  minimizedIpReference,
  parseCookies,
  randomToken,
  safeEqual,
  sessionCookie,
  sha256,
  summarizeUserAgent
} from './admin-crypto.mjs';
import { permissionsForRoles, roleSummary } from './admin-permissions.mjs';
import { getAdminUser, publicAdminUser } from './admin-user-service.mjs';

const STORE_NAME = 'izhe-admin-sessions';
const SESSION_PREFIX = 'sessions/';
const INDEX_PREFIX = 'indexes/';
const store = () => getStore(STORE_NAME);
const recordKey = (sessionHash) => `${SESSION_PREFIX}${sessionHash}.json`;
const indexKey = (id) => `${INDEX_PREFIX}${id}.json`;

export function adminSessionConfiguration() {
  const required = {
    IZHE_ADMIN_OIDC_ISSUER: process.env.IZHE_ADMIN_OIDC_ISSUER,
    IZHE_ADMIN_OIDC_CLIENT_ID: process.env.IZHE_ADMIN_OIDC_CLIENT_ID,
    IZHE_ADMIN_OIDC_CLIENT_SECRET: process.env.IZHE_ADMIN_OIDC_CLIENT_SECRET,
    IZHE_ADMIN_OIDC_REDIRECT_URI: process.env.IZHE_ADMIN_OIDC_REDIRECT_URI,
    IZHE_ADMIN_REQUIRED_ACR: process.env.IZHE_ADMIN_REQUIRED_ACR,
    IZHE_ADMIN_SESSION_SECRET: process.env.IZHE_ADMIN_SESSION_SECRET,
    IZHE_ADMIN_AUDIT_SIGNING_SECRET: process.env.IZHE_ADMIN_AUDIT_SIGNING_SECRET
  };
  const missing = Object.entries(required).filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  return { configured: missing.length === 0, missing };
}

export function sessionDurations() {
  return {
    idleSeconds: intEnv('IZHE_ADMIN_SESSION_IDLE_SECONDS', 30 * 60, { min: 5 * 60, max: 4 * 60 * 60 }),
    absoluteSeconds: intEnv('IZHE_ADMIN_SESSION_ABSOLUTE_SECONDS', 8 * 60 * 60, { min: 30 * 60, max: 24 * 60 * 60 }),
    recentAuthSeconds: intEnv('IZHE_ADMIN_RECENT_AUTH_SECONDS', 10 * 60, { min: 60, max: 60 * 60 }),
    touchIntervalSeconds: intEnv('IZHE_ADMIN_SESSION_TOUCH_SECONDS', 60, { min: 30, max: 10 * 60 })
  };
}

function requireSessionSecret() {
  const secret = process.env.IZHE_ADMIN_SESSION_SECRET || '';
  if (secret.length < 32) throw Object.assign(new Error('Administrator session configuration is incomplete.'), { statusCode: 503, configurationError: true });
  return secret;
}

export function csrfTokenFor(rawSessionId, csrfVersion = 1) {
  return hmac256(requireSessionSecret(), `csrf:${rawSessionId}:${csrfVersion}`);
}

function cleanSession(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    id: String(record.id || ''),
    sessionHash: String(record.sessionHash || ''),
    userId: String(record.userId || ''),
    userSessionVersion: Number(record.userSessionVersion || 0),
    createdAt: record.createdAt || null,
    lastActivityAt: record.lastActivityAt || null,
    idleExpiresAt: record.idleExpiresAt || null,
    absoluteExpiresAt: record.absoluteExpiresAt || null,
    authTime: record.authTime || null,
    mfaSatisfiedAt: record.mfaSatisfiedAt || null,
    csrfVersion: Math.max(1, Number(record.csrfVersion || 1)),
    userAgentSummary: record.userAgentSummary || null,
    sourceIpHash: record.sourceIpHash || null,
    revokedAt: record.revokedAt || null,
    revokedBy: record.revokedBy || null,
    revokeReason: record.revokeReason || null
  };
}

async function saveSession(record) {
  await store().setJSON(recordKey(record.sessionHash), record);
  await store().setJSON(indexKey(record.id), { sessionHash: record.sessionHash, userId: record.userId });
}

export async function createAdminSession({ user, request, authTime, mfaSatisfiedAt }) {
  const config = adminSessionConfiguration();
  if (!config.configured) throw Object.assign(new Error('Administrator identity configuration is incomplete.'), { statusCode: 503, configurationError: true, missing: config.missing });
  const rawSessionId = randomToken(32);
  const sessionHash = sha256(rawSessionId);
  const id = `sess_${randomToken(15)}`;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const durations = sessionDurations();
  const session = cleanSession({
    id,
    sessionHash,
    userId: user.id,
    userSessionVersion: user.sessionVersion,
    createdAt: now,
    lastActivityAt: now,
    idleExpiresAt: new Date(nowMs + durations.idleSeconds * 1000).toISOString(),
    absoluteExpiresAt: new Date(nowMs + durations.absoluteSeconds * 1000).toISOString(),
    authTime: new Date(Number(authTime || Math.floor(nowMs / 1000)) * 1000).toISOString(),
    mfaSatisfiedAt: mfaSatisfiedAt || now,
    csrfVersion: 1,
    userAgentSummary: summarizeUserAgent(request.headers.get('user-agent')),
    sourceIpHash: minimizedIpReference(request),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null
  });
  await saveSession(session);
  return {
    rawSessionId,
    session,
    setCookie: sessionCookie(rawSessionId, durations.absoluteSeconds)
  };
}

async function sessionByRawId(rawSessionId) {
  if (!rawSessionId) return null;
  const sessionHash = sha256(rawSessionId);
  const record = await store().get(recordKey(sessionHash), { type: 'json', consistency: 'strong' }).catch(() => null);
  const session = cleanSession(record);
  return session && safeEqual(session.sessionHash, sessionHash) ? session : null;
}

export async function loadAdminSession(request, { touch = true } = {}) {
  const configuration = adminSessionConfiguration();
  if (!configuration.configured) {
    throw Object.assign(new Error('Administrator identity configuration is incomplete.'), {
      statusCode: 503,
      configurationError: true,
      missing: configuration.missing
    });
  }
  const rawSessionId = parseCookies(request.headers.get('cookie'))[ADMIN_SESSION_COOKIE] || '';
  const session = await sessionByRawId(rawSessionId);
  if (!session || session.revokedAt) return null;

  const nowMs = Date.now();
  const idleMs = Date.parse(session.idleExpiresAt || '');
  const absoluteMs = Date.parse(session.absoluteExpiresAt || '');
  if (!Number.isFinite(idleMs) || !Number.isFinite(absoluteMs) || nowMs >= idleMs || nowMs >= absoluteMs) {
    await revokeSessionRecord(session, { userId: 'system' }, 'expired');
    return null;
  }

  const user = await getAdminUser(session.userId);
  if (!user || user.status !== 'active' || !user.emailVerified || !user.mfaSatisfiedAt) return null;
  if (session.userSessionVersion !== user.sessionVersion) return null;

  const durations = sessionDurations();
  const lastActivityMs = Date.parse(session.lastActivityAt || '');
  if (touch && (!Number.isFinite(lastActivityMs) || nowMs - lastActivityMs >= durations.touchIntervalSeconds * 1000)) {
    session.lastActivityAt = new Date(nowMs).toISOString();
    session.idleExpiresAt = new Date(Math.min(absoluteMs, nowMs + durations.idleSeconds * 1000)).toISOString();
    await saveSession(session);
  }

  return {
    rawSessionId,
    session,
    user,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: [...user.roles],
    permissions: permissionsForRoles(user.roles),
    csrfToken: csrfTokenFor(rawSessionId, session.csrfVersion),
    sessionId: session.id,
    sessionHash: session.sessionHash
  };
}

export function recentAuthenticationSatisfied(context, nowMs = Date.now()) {
  const authMs = Date.parse(context?.session?.authTime || '');
  return Number.isFinite(authMs) && nowMs - authMs <= sessionDurations().recentAuthSeconds * 1000;
}

export function validateCsrf(request, context) {
  const supplied = request.headers.get('x-izhe-csrf') || '';
  return Boolean(supplied && context?.csrfToken && safeEqual(supplied, context.csrfToken));
}

async function revokeSessionRecord(session, actor, reason) {
  if (!session || session.revokedAt) return session;
  const updated = cleanSession({
    ...session,
    revokedAt: new Date().toISOString(),
    revokedBy: actor?.userId || 'system',
    revokeReason: String(reason || 'revoked').slice(0, 200)
  });
  await saveSession(updated);
  return updated;
}

export async function revokeSessionById(id, actor, reason = 'revoked') {
  const index = await store().get(indexKey(id), { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!index?.sessionHash) return null;
  const record = await store().get(recordKey(index.sessionHash), { type: 'json', consistency: 'strong' }).catch(() => null);
  const session = cleanSession(record);
  return session ? revokeSessionRecord(session, actor, reason) : null;
}

export async function revokeCurrentSession(request, actor, reason = 'logout') {
  const rawSessionId = parseCookies(request.headers.get('cookie'))[ADMIN_SESSION_COOKIE] || '';
  const session = await sessionByRawId(rawSessionId);
  if (session) await revokeSessionRecord(session, actor, reason);
  return { session, clearCookie: clearSessionCookie() };
}

export async function revokeUserSessions(userId, actor, reason = 'account changed') {
  const sessions = await listAdminSessions({ userId, includeRevoked: false });
  for (const session of sessions) await revokeSessionRecord(session, actor, reason);
  return sessions.length;
}

export async function listAdminSessions({ userId = '', includeRevoked = false } = {}) {
  const result = await store().list({ prefix: SESSION_PREFIX });
  const sessions = [];
  for (const blob of result.blobs || []) {
    const session = cleanSession(await store().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null));
    if (!session?.id) continue;
    if (userId && session.userId !== userId) continue;
    if (!includeRevoked && session.revokedAt) continue;
    sessions.push(session);
  }
  return sessions.sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')));
}

export function publicSession(contextOrSession, { currentSessionId = '' } = {}) {
  const context = contextOrSession?.session ? contextOrSession : null;
  const session = context?.session || contextOrSession;
  if (!session) return null;
  return {
    id: session.id,
    current: session.id === currentSessionId,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    mfaSatisfiedAt: session.mfaSatisfiedAt,
    userAgentSummary: session.userAgentSummary,
    revokedAt: session.revokedAt,
    revokeReason: session.revokeReason
  };
}

export function currentSessionPayload(context) {
  return {
    authenticated: true,
    administrator: publicAdminUser(context.user),
    roles: roleSummary(context.roles),
    roleIds: [...context.roles],
    permissions: [...context.permissions],
    csrfToken: context.csrfToken,
    session: publicSession(context, { currentSessionId: context.session.id }),
    timeouts: sessionDurations()
  };
}
