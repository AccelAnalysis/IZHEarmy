import { getStore } from '@netlify/blobs';
import { normalizeEmail, randomToken, sha256 } from './admin-crypto.mjs';
import { validRoles } from './admin-permissions.mjs';

const STORE_NAME = 'izhe-admin-users';
const USERS_PREFIX = 'users/';
const EMAIL_PREFIX = 'indexes/email/';
const SUBJECT_PREFIX = 'indexes/subject/';
export const ADMIN_STATUSES = Object.freeze(['invited', 'active', 'suspended', 'disabled']);

const store = () => getStore(STORE_NAME);
const userKey = (id) => `${USERS_PREFIX}${id}.json`;
const emailKey = (email) => `${EMAIL_PREFIX}${sha256(normalizeEmail(email))}.json`;
const subjectKey = (subject) => `${SUBJECT_PREFIX}${sha256(subject)}.json`;

function cleanUser(record) {
  if (!record || typeof record !== 'object') return null;
  return {
    id: String(record.id || ''),
    providerSubject: record.providerSubject ? String(record.providerSubject) : null,
    email: normalizeEmail(record.email),
    emailVerified: Boolean(record.emailVerified),
    displayName: String(record.displayName || record.email || '').trim().slice(0, 160),
    status: ADMIN_STATUSES.includes(record.status) ? record.status : 'disabled',
    roles: validRoles(record.roles),
    createdAt: record.createdAt || null,
    createdBy: record.createdBy || null,
    updatedAt: record.updatedAt || null,
    updatedBy: record.updatedBy || null,
    lastLoginAt: record.lastLoginAt || null,
    mfaSatisfiedAt: record.mfaSatisfiedAt || null,
    sessionVersion: Math.max(1, Number(record.sessionVersion || 1)),
    invitationNote: record.invitationNote ? String(record.invitationNote).slice(0, 500) : ''
  };
}

async function getIndex(key) {
  return store().get(key, { type: 'json', consistency: 'strong' }).catch(() => null);
}

async function setIndex(key, userId) {
  await store().setJSON(key, { userId, updatedAt: new Date().toISOString() });
}

export async function getAdminUser(id) {
  if (!id) return null;
  return cleanUser(await store().get(userKey(id), { type: 'json', consistency: 'strong' }).catch(() => null));
}

export async function getAdminUserByEmail(email) {
  const index = await getIndex(emailKey(email));
  return index?.userId ? getAdminUser(index.userId) : null;
}

export async function getAdminUserBySubject(subject) {
  if (!subject) return null;
  const index = await getIndex(subjectKey(subject));
  return index?.userId ? getAdminUser(index.userId) : null;
}

export async function listAdminUsers() {
  const result = await store().list({ prefix: USERS_PREFIX });
  const users = [];
  for (const blob of result.blobs || []) {
    const record = await store().get(blob.key, { type: 'json', consistency: 'strong' }).catch(() => null);
    const user = cleanUser(record);
    if (user?.id) users.push(user);
  }
  return users.sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
}

export async function activeOwners() {
  return (await listAdminUsers()).filter((user) => user.status === 'active' && user.roles.includes('owner'));
}

export async function createInvitation({ email, displayName = '', roles = [], note = '', actor }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) throw Object.assign(new Error('A valid email address is required.'), { statusCode: 400 });
  const assignedRoles = validRoles(roles);
  if (!assignedRoles.length) throw Object.assign(new Error('At least one valid administrator role is required.'), { statusCode: 400 });
  const existing = await getAdminUserByEmail(normalized);
  if (existing && existing.status !== 'disabled') throw Object.assign(new Error('An administrator or pending invitation already exists for this email address.'), { statusCode: 409 });

  const now = new Date().toISOString();
  const user = cleanUser({
    id: existing?.id || `adm_${randomToken(18)}`,
    providerSubject: null,
    email: normalized,
    emailVerified: false,
    displayName: String(displayName || normalized).trim().slice(0, 160),
    status: 'invited',
    roles: assignedRoles,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || actor?.userId || 'bootstrap',
    updatedAt: now,
    updatedBy: actor?.userId || 'bootstrap',
    lastLoginAt: null,
    mfaSatisfiedAt: null,
    sessionVersion: Number(existing?.sessionVersion || 0) + 1,
    invitationNote: String(note || '').slice(0, 500)
  });
  await store().setJSON(userKey(user.id), user);
  await setIndex(emailKey(normalized), user.id);
  return user;
}

function bootstrapEmails() {
  return new Set((process.env.IZHE_ADMIN_BOOTSTRAP_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean));
}

export async function findOrActivateAdministrator({
  providerSubject,
  email,
  emailVerified,
  displayName,
  mfaSatisfiedAt,
  actor = 'oidc'
}) {
  const normalized = normalizeEmail(email);
  if (!providerSubject || !normalized || !emailVerified) {
    throw Object.assign(new Error('Administrator identity could not be verified.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
  }

  let user = await getAdminUserBySubject(providerSubject);
  if (!user) {
    user = await getAdminUserByEmail(normalized);
    if (!user) {
      const owners = await activeOwners();
      if (owners.length || !bootstrapEmails().has(normalized)) {
        throw Object.assign(new Error('Identity is not invited.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
      }
      user = await createInvitation({ email: normalized, displayName, roles: ['owner'], note: 'Initial Owner bootstrap', actor: { userId: 'bootstrap' } });
    }
    if (user.status !== 'invited' || user.providerSubject) {
      throw Object.assign(new Error('Identity cannot be bound to this invitation.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
    }
  }

  if (user.providerSubject && user.providerSubject !== providerSubject) {
    throw Object.assign(new Error('Provider subject does not match the bound administrator.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
  }
  if (user.email !== normalized) {
    throw Object.assign(new Error('Verified provider email does not match the administrator invitation.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
  }
  if (user.status === 'suspended' || user.status === 'disabled') {
    throw Object.assign(new Error('Administrator account is not active.'), { statusCode: 403, publicMessage: 'Administrator access was not authorized.' });
  }

  const now = new Date().toISOString();
  const activated = cleanUser({
    ...user,
    providerSubject,
    emailVerified: true,
    displayName: String(displayName || user.displayName || normalized).trim().slice(0, 160),
    status: 'active',
    updatedAt: now,
    updatedBy: actor,
    lastLoginAt: now,
    mfaSatisfiedAt
  });
  await store().setJSON(userKey(activated.id), activated);
  await Promise.all([
    setIndex(emailKey(normalized), activated.id),
    setIndex(subjectKey(providerSubject), activated.id)
  ]);
  return activated;
}

export async function updateAdminUser(id, changes, actor) {
  const existing = await getAdminUser(id);
  if (!existing) throw Object.assign(new Error('Administrator not found.'), { statusCode: 404 });

  const nextStatus = changes.status === undefined ? existing.status : String(changes.status);
  if (!ADMIN_STATUSES.includes(nextStatus)) throw Object.assign(new Error('Invalid administrator status.'), { statusCode: 400 });
  const nextRoles = changes.roles === undefined ? existing.roles : validRoles(changes.roles);
  if (!nextRoles.length) throw Object.assign(new Error('At least one administrator role is required.'), { statusCode: 400 });

  const removesOwner = existing.status === 'active' && existing.roles.includes('owner')
    && (nextStatus !== 'active' || !nextRoles.includes('owner'));
  if (removesOwner) {
    const owners = await activeOwners();
    if (owners.length <= 1) throw Object.assign(new Error('The final active Owner cannot be removed, disabled, suspended, or demoted.'), { statusCode: 409 });
  }

  const sensitiveChange = existing.status !== nextStatus
    || existing.roles.join('|') !== nextRoles.join('|');
  const updated = cleanUser({
    ...existing,
    displayName: changes.displayName === undefined ? existing.displayName : String(changes.displayName || existing.email).trim().slice(0, 160),
    status: nextStatus,
    roles: nextRoles,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.userId || 'system',
    sessionVersion: existing.sessionVersion + (sensitiveChange ? 1 : 0)
  });
  await store().setJSON(userKey(updated.id), updated);
  return { user: updated, sensitiveChange };
}

export function publicAdminUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles: [...user.roles],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    mfaSatisfiedAt: user.mfaSatisfiedAt,
    providerBound: Boolean(user.providerSubject)
  };
}
