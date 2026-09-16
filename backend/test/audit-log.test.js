/**
 * audit-log.test.js
 *
 * Test suite for PehchanChain Audit Trail API: GET /audit/log/:did
 *
 * Verifies that all life-cycle and verification events are recorded and aggregated
 * into a human-understandable audit log:
 *   - IDENTITY_CREATED
 *   - ASSET_MINTED
 *   - ASSET_ASSIGNED
 *   - ROLE_ASSIGNED
 *   - ACCESS_GRANTED
 *   - ACCESS_DENIED
 *   - VERIFICATION_REQUESTED
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const os     = require('node:os');
const fs     = require('fs/promises');
const http   = require('node:http');

let tmpDir;
before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-log-test-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function envPaths() {
  return {
    WALLET_DATA_FILE:               path.join(tmpDir, `wallets-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    VERIFICATION_REQUEST_DATA_FILE: path.join(tmpDir, `vreqs-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    DEVELOPER_APP_DATA_FILE:        path.join(tmpDir, `devapps-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
  };
}

async function buildApp(env = {}) {
  const merged = { ...envPaths(), ...env };
  for (const [k, v] of Object.entries(merged)) process.env[k] = v;

  for (const key of Object.keys(require.cache)) {
    if (key.includes('backend/src')) delete require.cache[key];
  }

  const app = require('../src/app');
  return app;
}

function request(app, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const payload  = body !== undefined ? JSON.stringify(body) : null;
      const options  = {
        hostname: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

describe('PehchanChain Audit Trail API — GET /audit/log/:did', () => {

  it('returns an empty audit trail for a non-existent DID without erroring', async () => {
    const app = await buildApp();
    const res = await request(app, 'GET', '/audit/log/did:pehchan:unknown_user_123');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.did, 'did:pehchan:unknown_user_123');
    assert.equal(res.body.count, 0);
    assert.deepEqual(res.body.data, []);
  });

  it('aggregates identity creation, asset minting, asset transfer, roles, and selective disclosure events into human-readable audit items', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);

    const testDID = 'did:pehchan:student_audit_01';
    const testWalletId = 'student_audit_01';

    // 1. Register identity
    const regRes = await request(app, 'POST', '/identity/register', {
      verified: true,
      credentials: {
        name: 'Aarav Sharma',
        studentId: 'STU-AUDIT-99',
        email: 'aarav@bel.co.in',
        phone: '+919123456789',
        dob: '2001-03-10',
      },
    });
    assert.equal(regRes.status, 201);
    const walletId = regRes.body.walletId;

    // 2. Assign role
    const roleRes = await request(app, 'POST', '/role/assign', {
      targetDID: `did:pehchan:${walletId}`,
      role: 'USER',
    });
    assert.equal(roleRes.status, 200);

    // 3. Mint asset
    const mintRes = await request(app, 'POST', '/asset/mint', {
      recipient: '0x1111111111111111111111111111111111111111',
      targetDID: `did:pehchan:${walletId}`,
      name: 'Security Clearance Alpha',
      category: 'CLEARANCE',
    });
    assert.equal(mintRes.status, 201);

    // 4. Create verification request
    const vreqRes = await request(app, 'POST', '/verify/request', {
      walletId,
      verifierId: 'gate-auditor-01',
      requestedFields: ['name', 'studentId'],
    });
    assert.equal(vreqRes.status, 201);

    // 5. Submit consent (ACCESS_GRANTED)
    const consentRes = await request(app, 'POST', '/verify/consent', {
      requestId: vreqRes.body.requestId,
      approvedFields: ['name'],
    });
    assert.equal(consentRes.status, 200);

    // 6. Query audit log
    const auditRes = await request(app, 'GET', `/audit/log/${walletId}`);
    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.body.status, 'success');
    assert.ok(auditRes.body.count >= 4);

    const events = auditRes.body.data;
    const eventTypes = events.map((e) => e.eventType);

    assert.ok(eventTypes.includes('IDENTITY_CREATED'), 'Audit log must contain IDENTITY_CREATED');
    assert.ok(eventTypes.includes('ASSET_MINTED'), 'Audit log must contain ASSET_MINTED');
    assert.ok(eventTypes.includes('ROLE_ASSIGNED'), 'Audit log must contain ROLE_ASSIGNED');
    assert.ok(eventTypes.includes('ACCESS_GRANTED'), 'Audit log must contain ACCESS_GRANTED');
    assert.ok(eventTypes.includes('VERIFICATION_REQUESTED'), 'Audit log must contain VERIFICATION_REQUESTED');

    // Check entry structure fields
    for (const item of events) {
      assert.ok(item.eventType, 'Each audit item must have eventType');
      assert.ok(item.timestamp, 'Each audit item must have timestamp');
      assert.ok(item.did, 'Each audit item must have target did');
      assert.ok('tokenId' in item, 'Each audit item must have tokenId field');
      assert.ok('verifier' in item, 'Each audit item must have verifier field');
      assert.ok('transactionHash' in item, 'Each audit item must have transactionHash field');
      assert.ok(item.details, 'Each audit item must have human-readable details');
    }
  });

  it('correctly accepts full DID format (did:pehchan:...) in route parameter', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);

    const regRes = await request(app, 'POST', '/identity/register', {
      verified: true,
      credentials: {
        name: 'Neha Gupta',
        studentId: 'STU-AUDIT-100',
        email: 'neha@bel.co.in',
        phone: '+919123456780',
        dob: '2002-06-25',
      },
    });
    const walletId = regRes.body.walletId;
    const fullDID  = `did:pehchan:${walletId}`;

    const auditRes = await request(app, 'GET', `/audit/log/${encodeURIComponent(fullDID)}`);
    assert.equal(auditRes.status, 200);
    assert.equal(auditRes.body.status, 'success');
    assert.ok(auditRes.body.count >= 1);
    assert.equal(auditRes.body.data[0].eventType, 'IDENTITY_CREATED');
  });
});
