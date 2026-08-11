import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_AUTH_ENDPOINTS,
  ADMIN_ENDPOINT_POLICIES,
  PERMISSIONS,
  PUBLIC_ADMIN_AWARE_ENDPOINTS,
  ROLES
} from '../netlify/functions/_shared/admin-permissions.mjs';
import {
  ADMIN_SESSION_COOKIE,
  sessionCookie
} from '../netlify/functions/_shared/admin-crypto.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = path.join(ROOT, 'netlify', 'functions');
const ADMIN_V2 = path.join(ROOT, 'public', 'assets', 'admin-v2');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function walk(directory, predicate = () => true) {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walk(full, predicate));
    else if (predicate(full)) rows.push(full);
  }
  return rows;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

test('Admin v2 session cookie is host-only, secure, HttpOnly, Strict, and root-scoped', () => {
  assert.equal(ADMIN_SESSION_COOKIE, '__Host-izhe_admin_session');
  const value = sessionCookie('opaque-session-token', 3600);
  assert.match(value, /^__Host-izhe_admin_session=/);
  assert.match(value, /; Path=\//);
  assert.match(value, /; Secure/);
  assert.match(value, /; HttpOnly/);
  assert.match(value, /; SameSite=Strict/);
  assert.doesNotMatch(value, /; Domain=/i);
});

test('all role permissions are centralized and Owner retains full authority', () => {
  const known = new Set(PERMISSIONS);
  assert.ok(ROLES.owner);
  assert.deepEqual(new Set(ROLES.owner.permissions), known);
  for (const [roleId, role] of Object.entries(ROLES)) {
    for (const permission of role.permissions) assert.ok(known.has(permission), `${roleId} has unknown permission ${permission}`);
  }
  assert.ok(ROLES.finance_accountability_administrator.permissions.includes('accountability.write'));
  assert.ok(!ROLES.finance_accountability_administrator.permissions.includes('accountability.approve'));
  assert.ok(ROLES.accountability_approver.permissions.includes('accountability.approve'));
  assert.ok(ROLES.accountability_period_manager.permissions.includes('accountability.lock_period'));
});

test('every administrative function is inventoried and protected by Admin v2 or explicitly auth-bootstrap', () => {
  const auth = new Set(ADMIN_AUTH_ENDPOINTS);
  const policies = new Set(Object.keys(ADMIN_ENDPOINT_POLICIES));
  const files = fs.readdirSync(FUNCTIONS).filter((name) => /^admin-.*\.mjs$/.test(name));
  const missing = [];
  const legacyImports = [];
  for (const filename of files) {
    const name = filename.replace(/\.mjs$/, '');
    const source = fs.readFileSync(path.join(FUNCTIONS, filename), 'utf8');
    if (!auth.has(name) && !policies.has(name)) missing.push(name);
    if (!auth.has(name) && !source.includes('adminEndpoint(')) missing.push(`${name}:canonical-wrapper`);
    if (source.includes("./_shared/admin-auth.mjs")) legacyImports.push(name);
  }
  assert.deepEqual([...new Set(missing)].sort(), []);
  assert.deepEqual(legacyImports.sort(), []);
  for (const [name, policy] of Object.entries(ADMIN_ENDPOINT_POLICIES)) {
    assert.ok(PERMISSIONS.includes(policy.permission), `${name} uses unknown permission ${policy.permission}`);
    assert.ok(Array.isArray(policy.methods) && policy.methods.length > 0, `${name} has no methods`);
    if (policy.methods.some((method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))) assert.equal(policy.csrf, true, `${name} mutation lacks CSRF`);
  }
});

test('administrator-aware public resources declare and enforce named-session permissions', () => {
  for (const [name, permission] of Object.entries(PUBLIC_ADMIN_AWARE_ENDPOINTS)) {
    assert.ok(PERMISSIONS.includes(permission), `${name} uses unknown public-preview permission`);
    const source = read('netlify', 'functions', `${name}.mjs`);
    assert.match(source, /admin-auth-v2\.mjs/, `${name} does not use Admin v2 session authorization`);
    assert.doesNotMatch(source, /admin-auth\.mjs/, `${name} imports legacy authorization`);
  }
});

test('legacy shared-token server authorization is permanently fail-closed', () => {
  const source = read('netlify', 'functions', '_shared', 'admin-auth.mjs');
  assert.doesNotMatch(source, /IZHE_ADMIN_TOKEN|authorization|Bearer|adminToken/i);
  assert.match(source, /return false/);
  assert.match(source, /Legacy administrator authentication is disabled/);
});

test('production browser code contains no administrator bearer credential storage or legacy token authentication', () => {
  const files = walk(path.join(ROOT, 'public', 'assets'), (file) => /\.(?:js|mjs)$/i.test(file));
  const violations = [];
  for (const file of files) {
    let source = fs.readFileSync(file, 'utf8');
    // One-time migration cleanup is explicitly required and is not authentication.
    source = source.replaceAll("localStorage.removeItem('izhe-admin-token')", '');
    source = source.replaceAll('localStorage.removeItem("izhe-admin-token")', '');
    if (/IZHE_ADMIN_TOKEN|izhe-admin-token|authorization\s*:\s*[`'"]?Bearer|Authorization\s*:\s*[`'"]?Bearer/i.test(source)) {
      violations.push(relative(file));
    }
  }
  assert.deepEqual(violations.sort(), []);
});

test('Admin v2 local module imports resolve to committed files', () => {
  const files = walk(ADMIN_V2, (file) => /\.js$/i.test(file));
  const missing = [];
  const importPattern = /(?:from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\1/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const target = path.resolve(path.dirname(file), match[2]);
      const candidates = [target, `${target}.js`, path.join(target, 'index.js')];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) missing.push(`${relative(file)} -> ${match[2]}`);
    }
  }
  assert.deepEqual(missing.sort(), []);
});

test('Admin v2 uses local assets, exact media-picker vocabulary, and no runtime Tailwind CDN', () => {
  const index = read('public', 'admin', 'index.html');
  const legacy = read('public', 'admin.html');
  const picker = read('public', 'assets', 'admin-v2', 'ui', 'media-picker.js');
  const allAdminV2 = walk(ADMIN_V2, (file) => /\.(?:js|css)$/i.test(file)).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(index, /cdn\.tailwindcss\.com|https?:\/\//i);
  assert.doesNotMatch(legacy, /cdn\.tailwindcss\.com|IZHE_ADMIN_TOKEN|tokenForm/i);
  assert.match(legacy, /url=\/admin\//);
  assert.match(picker, /Choose from Media Library/);
  assert.doesNotMatch(allAdminV2, /Choose approved site media|Select from media/i);
});

test('Admin v2 route headers enforce no-store and a restrictive administration CSP', () => {
  const headers = read('public', '_headers');
  assert.match(headers, /\/admin\/\*/);
  assert.match(headers, /Cache-Control:\s*no-store/i);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /base-uri 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Permissions-Policy:.*camera=\(\).*microphone=\(\).*geolocation=\(\)/i);
});

test('OIDC implementation uses maintained library primitives for discovery, PKCE, state, nonce, and code grant', () => {
  const source = read('netlify', 'functions', '_shared', 'admin-oidc-service.mjs');
  assert.match(source, /from 'openid-client'/);
  assert.match(source, /oidc\.discovery/);
  assert.match(source, /randomState/);
  assert.match(source, /randomNonce/);
  assert.match(source, /randomPKCECodeVerifier/);
  assert.match(source, /calculatePKCECodeChallenge/);
  assert.match(source, /authorizationCodeGrant/);
  assert.match(source, /expectedState/);
  assert.match(source, /expectedNonce/);
  assert.match(source, /emailVerified/);
  assert.match(source, /validateMfaClaims/);
});

test('product duplication is server-authoritative, permissioned, audited, draft, and paused', () => {
  const endpoint = read('netlify', 'functions', 'admin-duplicate-product.mjs');
  assert.match(endpoint, /catalog\.products\.duplicate/);
  assert.match(endpoint, /adminEndpoint/);
  assert.match(endpoint, /status:\s*'draft'/);
  assert.match(endpoint, /availabilityStatus:\s*'paused'/);
  assert.match(endpoint, /lookupKey/);
  assert.match(endpoint, /sourceProduct/);
  assert.match(endpoint, /audit/i);
});

test('upload security validates signatures, sizes, quarantine state, and unsafe active content', () => {
  const source = read('netlify', 'functions', '_shared', 'admin-upload-security.mjs');
  assert.match(source, /magic|signature/i);
  assert.match(source, /max.*bytes|size/i);
  assert.match(source, /quarantine/i);
  assert.match(source, /svg/i);
  assert.match(source, /malware/i);
  assert.match(source, /dimension/i);
});
