/**
 * PehchanChain RBAC API — Backend HTTP integration tests
 *
 * Uses node:test + native fetch against Express app.
 * Tests endpoints:
 *   - POST /role/assign
 *   - POST /role/revoke
 *   - GET /role/:did
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('assert/strict');
const app = require('../src/app');
const { mockRoleStore } = require('../src/services/rbacService');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

describe('PehchanChain RBAC API', () => {
  before(async () => {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    return new Promise((resolve) => {
      if (server) {
        server.close(resolve);
      } else {
        resolve();
      }
    });
  });

  beforeEach(() => {
    mockRoleStore.reset();
  });

  // ── POST /role/assign ──────────────────────────────────────────────────────

  it('POST /role/assign assigns role to valid DID', async () => {
    const payload = {
      targetDID: 'did:pehchan:wallet_manager_test',
      role: 'MANAGER',
    };

    const res = await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.targetDID, payload.targetDID);
    assert.equal(res.body.data.role, 'MANAGER');
    assert.ok(res.body.data.transactionHash);
  });

  it('POST /role/assign accepts lower-case role name and normalizes it', async () => {
    const res = await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({
        targetDID: 'did:pehchan:wallet_auditor_test',
        role: 'auditor',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'AUDITOR');
  });

  it('POST /role/assign rejects unsupported role', async () => {
    const res = await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({
        targetDID: 'did:pehchan:wallet_test',
        role: 'SUPERADMIN',
      }),
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Request Error');
    assert.match(res.body.message, /Allowed roles are: ADMIN, MANAGER, AUDITOR, USER/);
  });

  it('POST /role/assign rejects missing targetDID', async () => {
    const res = await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({
        role: 'MANAGER',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /targetDID is required/);
  });

  it('POST /role/assign rejects invalid DID string', async () => {
    const res = await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({
        targetDID: 'invalid_did_format',
        role: 'MANAGER',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid DID string/);
  });

  // ── GET /role/:did ─────────────────────────────────────────────────────────

  it('GET /role/:did returns active roles and view flags for target DID', async () => {
    const did = 'did:pehchan:wallet_multi_role';

    // Assign MANAGER and AUDITOR roles
    await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({ targetDID: did, role: 'MANAGER' }),
    });
    await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({ targetDID: did, role: 'AUDITOR' }),
    });

    const res = await request(`/role/${encodeURIComponent(did)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.targetDID, did);
    assert.ok(res.body.data.roles.includes('MANAGER'));
    assert.ok(res.body.data.roles.includes('AUDITOR'));
    assert.equal(res.body.data.isManager, true);
    assert.equal(res.body.data.isAuditor, true);
    assert.equal(res.body.data.isAdmin, false);
    assert.equal(res.body.data.isUser, false);
  });

  it('GET /role/:did returns empty roles list for DID with no assigned roles', async () => {
    const did = 'did:pehchan:wallet_noroles';
    const res = await request(`/role/${encodeURIComponent(did)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.targetDID, did);
    assert.deepEqual(res.body.data.roles, []);
    assert.equal(res.body.data.isAdmin, false);
    assert.equal(res.body.data.isManager, false);
    assert.equal(res.body.data.isAuditor, false);
    assert.equal(res.body.data.isUser, false);
  });

  // ── POST /role/revoke ──────────────────────────────────────────────────────

  it('POST /role/revoke revokes role from target DID', async () => {
    const did = 'did:pehchan:wallet_revoke_test';

    // Assign MANAGER role
    await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({ targetDID: did, role: 'MANAGER' }),
    });

    // Revoke MANAGER role
    const revokeRes = await request('/role/revoke', {
      method: 'POST',
      body: JSON.stringify({ targetDID: did, role: 'MANAGER' }),
    });

    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.status, 'success');
    assert.equal(revokeRes.body.data.role, 'MANAGER');

    // Query roles to verify removal
    const queryRes = await request(`/role/${encodeURIComponent(did)}`);
    assert.equal(queryRes.body.data.isManager, false);
    assert.ok(!queryRes.body.data.roles.includes('MANAGER'));
  });

  it('POST /role/revoke rejects missing role parameter', async () => {
    const res = await request('/role/revoke', {
      method: 'POST',
      body: JSON.stringify({
        targetDID: 'did:pehchan:wallet_test',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /role is required/);
  });
});
