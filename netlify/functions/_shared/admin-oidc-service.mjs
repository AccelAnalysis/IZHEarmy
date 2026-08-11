import { getStore } from '@netlify/blobs';
import * as oidc from 'openid-client';
import {
  ADMIN_LOGIN_COOKIE,
  clearLoginCookie,
  loginCookie,
  normalizeEmail,
  parseCookies,
  randomToken,
  safeEqual,
  safeReturnPath,
  sha256
} from './admin-crypto.mjs';
import { appendAdminAuditEvent } from './admin-audit-service.mjs';
import { checkAdminRateLimit } from './admin-rate-limit.mjs';
import { createAdminSession, revokeSessionById } from './admin-session-service.mjs';
import { findOrActivateAdministrator } from './admin-user-service.mjs';

const STORE_NAME = 'izhe-admin-login';
const TRANSACTION_PREFIX = 'transactions/';
const store = () => getStore(STORE_NAME);
const transactionKey = (state) => `${TRANSACTION_PREFIX}${sha256(state)}.json`;
let cachedConfiguration;
let cachedConfigurationKey = '';

function oidcEnvironment() {
  const config = {
    issuer: String(process.env.IZHE_ADMIN_OIDC_ISSUER || '').trim(),
    clientId: String(process.env.IZHE_ADMIN_OIDC_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.IZHE_ADMIN_OIDC_CLIENT_SECRET || ''),
    redirectUri: String(process.env.IZHE_ADMIN_OIDC_REDIRECT_URI || '').trim(),
    requiredAcr: String(process.env.IZHE_ADMIN_REQUIRED_ACR || '').trim()
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw Object.assign(new Error('Administrator identity configuration is incomplete.'), { statusCode: 503, configurationError: true, missing });
  return config;
}

async function configuration() {
  const env = oidcEnvironment();
  const key = `${env.issuer}\n${env.clientId}\n${sha256(env.clientSecret)}`;
  if (!cachedConfiguration || cachedConfigurationKey !== key) {
    cachedConfiguration = await oidc.discovery(new URL(env.issuer), env.clientId, env.clientSecret);
    cachedConfigurationKey = key;
  }
  return { client: cachedConfiguration, env };
}

function validateMfaClaims(claims, requiredAcr) {
  if (!claims || claims.acr !== requiredAcr) {
    throw Object.assign(new Error('Required OIDC assurance level was not satisfied.'), { statusCode: 403, publicMessage: 'Administrator access requires multifactor authentication.' });
  }
  if (claims.amr !== undefined) {
    const amr = Array.isArray(claims.amr) ? claims.amr.map(String) : [String(claims.amr)];
    const recognizedSecondFactor = amr.some((method) => ['mfa', 'otp', 'totp', 'sms', 'hwk', 'swk', 'fpt', 'face', 'voice'].includes(method.toLowerCase()));
    if (!recognizedSecondFactor && amr.length < 2) {
      throw Object.assign(new Error('OIDC amr claim does not demonstrate MFA.'), { statusCode: 403, publicMessage: 'Administrator access requires multifactor authentication.' });
    }
  }
  return true;
}

function cleanClaims(claims) {
  return {
    subject: String(claims.sub || ''),
    email: normalizeEmail(claims.email),
    emailVerified: claims.email_verified === true,
    displayName: String(claims.name || claims.preferred_username || claims.email || '').trim().slice(0, 160),
    authTime: Number(claims.auth_time || Math.floor(Date.now() / 1000)),
    acr: claims.acr,
    amr: claims.amr
  };
}

export async function beginAdministratorLogin(request, {
  returnTo = '/admin/',
  purpose = 'login',
  expectedUserId = null,
  priorSessionId = null
} = {}) {
  const rate = await checkAdminRateLimit(request, null, 'login');
  if (!rate.allowed) throw Object.assign(new Error('Administrator login is temporarily rate limited.'), { statusCode: 429, retryAfter: rate.retryAfter });
  const { client, env } = await configuration();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const browserBinding = randomToken(24);
  const now = Date.now();
  const transaction = {
    stateHash: sha256(state),
    nonce,
    codeVerifier,
    browserBindingHash: sha256(browserBinding),
    returnTo: safeReturnPath(returnTo),
    purpose: purpose === 'step-up' ? 'step-up' : 'login',
    expectedUserId,
    priorSessionId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString()
  };
  const saved = await store().setJSON(transactionKey(state), transaction, { onlyIfNew: true });
  if (!saved.modified) throw new Error('Unable to initialize a unique administrator login transaction.');

  const parameters = {
    redirect_uri: env.redirectUri,
    scope: 'openid email profile',
    response_type: 'code',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    acr_values: env.requiredAcr
  };
  if (transaction.purpose === 'step-up') {
    parameters.prompt = 'login';
    parameters.max_age = '0';
  }
  const destination = oidc.buildAuthorizationUrl(client, parameters);
  return {
    destination,
    setCookie: loginCookie(browserBinding),
    transaction
  };
}

async function consumeTransaction(state) {
  if (!state) throw Object.assign(new Error('OIDC state is missing.'), { statusCode: 400 });
  const key = transactionKey(state);
  const transaction = await store().get(key, { type: 'json', consistency: 'strong' }).catch(() => null);
  if (!transaction) throw Object.assign(new Error('OIDC state is invalid or expired.'), { statusCode: 400 });
  await store().delete(key).catch(() => null);
  if (transaction.stateHash !== sha256(state) || Date.parse(transaction.expiresAt || '') <= Date.now()) {
    throw Object.assign(new Error('OIDC state is invalid or expired.'), { statusCode: 400 });
  }
  return transaction;
}

export async function completeAdministratorLogin(request, requestId) {
  const rate = await checkAdminRateLimit(request, null, 'callback');
  if (!rate.allowed) throw Object.assign(new Error('Administrator login is temporarily rate limited.'), { statusCode: 429, retryAfter: rate.retryAfter });
  const callbackUrl = new URL(request.url);
  const state = callbackUrl.searchParams.get('state') || '';
  const transaction = await consumeTransaction(state);
  const browserBinding = parseCookies(request.headers.get('cookie'))[ADMIN_LOGIN_COOKIE] || '';
  if (!browserBinding || !safeEqual(sha256(browserBinding), transaction.browserBindingHash)) {
    throw Object.assign(new Error('OIDC browser binding failed.'), { statusCode: 400 });
  }

  const { client, env } = await configuration();
  const tokens = await oidc.authorizationCodeGrant(client, callbackUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true
  });
  const claims = tokens.claims();
  if (!claims) throw Object.assign(new Error('The identity provider did not return a validated ID token.'), { statusCode: 403 });
  validateMfaClaims(claims, env.requiredAcr);
  const identity = cleanClaims(claims);
  if (!identity.subject || !identity.email || !identity.emailVerified) {
    throw Object.assign(new Error('The identity provider did not return a verified administrator email.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
  }
  if (transaction.purpose === 'step-up' && !claims.auth_time) {
    throw Object.assign(new Error('Step-up authentication did not provide auth_time.'), { statusCode: 403, publicMessage: 'Recent authentication could not be verified.' });
  }

  const mfaSatisfiedAt = new Date().toISOString();
  const user = await findOrActivateAdministrator({
    providerSubject: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
    mfaSatisfiedAt,
    actor: 'oidc'
  });
  if (transaction.expectedUserId && user.id !== transaction.expectedUserId) {
    throw Object.assign(new Error('Step-up identity does not match the active administrator.'), { statusCode: 403, publicMessage: 'Recent authentication could not be verified.' });
  }

  const created = await createAdminSession({
    user,
    request,
    authTime: identity.authTime,
    mfaSatisfiedAt
  });
  if (transaction.priorSessionId) {
    await revokeSessionById(transaction.priorSessionId, { userId: user.id }, 'rotated after step-up authentication');
  }
  await appendAdminAuditEvent({
    request,
    requestId,
    context: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      sessionHash: created.session.sessionHash
    },
    action: transaction.purpose === 'step-up' ? 'session.step_up' : 'session.login',
    resourceType: 'administrator_session',
    resourceId: created.session.id,
    result: 'success',
    afterSummary: { assurance: identity.acr, mfa: true, purpose: transaction.purpose }
  });
  return {
    user,
    session: created.session,
    returnTo: transaction.returnTo,
    headers: {
      'set-cookie': [created.setCookie, clearLoginCookie()]
    }
  };
}

export function genericAuthenticationError(error) {
  const status = Number(error?.statusCode || 500);
  return {
    status,
    message: status === 429
      ? 'Administrator login is temporarily unavailable. Try again later.'
      : error?.configurationError
        ? 'Administrator identity is not configured.'
        : error?.publicMessage || 'Administrator access was not authorized.'
  };
}
