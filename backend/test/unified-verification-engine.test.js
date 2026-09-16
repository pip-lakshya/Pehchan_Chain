/**
 * unified-verification-engine.test.js
 *
 * Test suite proving that Mode 1 (Manual Verifier) and Mode 2 (Developer SDK)
 * both use EXACTLY the same underlying Selective-Disclosure Verification Engine,
 * and enforce equivalent authorization semantics.
 *
 * Architecture:
 *             ┌──────────────────────┐
 *             │ Unified Verification │
 *             │       Engine         │
 *             └──────────┬───────────┘
 *                        │
 *             ┌──────────┴──────────┐
 *             │                     │
 *      Manual Verifier        Developer SDK
 *         Mode 1                  Mode 2
 *
 * Requirements Verified:
 *   ✔ Requested fields validation
 *   ✔ User consent flow
 *   ✔ Selective disclosure (approved vs withheld fields)
 *   ✔ Approved-only response data
 *   ✔ Disclosure logging in wallet history
 *   ✔ Status polling privacy isolation (no credentials exposed before consent)
 *   ✔ Equivalent authorization semantics across both modes
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const os     = require('node:os');
const fs     = require('fs/promises');
const http   = require('node:http');

// ─── Setup Isolated Test Environment ──────────────────────────────────────────
let tmpDir;
before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unified-engine-test-'));
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

  // Clear module cache to instantiate fresh stores per test run
  for (const key of Object.keys(require.cache)) {
    if (key.includes('backend/src')) delete require.cache[key];
  }

  const app = require('../src/app');
  return app;
}

function request(app, method, urlPath, body, headers = {}) {
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
          ...headers,
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

// Seed test wallet with full credential set
async function seedWallet(walletFile, walletId = 'w_unified_user') {
  const wallet = {
    walletId,
    credentials: {
      name: 'Rohan Verma',
      studentId: 'BEL-2026-88',
      email: 'rohan@bel.co.in',
      phone: '+919876543210',
      dob: '2000-11-20',
    },
    biometricCommitment: null,
    createdAt: new Date().toISOString(),
    disclosureHistory: [],
  };
  await fs.mkdir(path.dirname(walletFile), { recursive: true });
  await fs.writeFile(walletFile, JSON.stringify([wallet], null, 2), 'utf8');
  return wallet;
}

// Helper to create a developer app and return its credentials
async function seedDeveloperApp(app, name = 'Unified Partner Portal') {
  const res = await request(app, 'POST', '/developer/apps', { name });
  assert.equal(res.status, 201);
  return res.body; // { appId, name, apiKey, apiSecret }
}

// ─── Unified Verification Engine Test Suite ──────────────────────────────────
describe('Unified Verification Engine — Mode 1 (Manual Verifier) & Mode 2 (Developer SDK)', () => {

  it('Mode 1 and Mode 2 both create pending verification requests in the unified engine store', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);
    const devApp = await seedDeveloperApp(app);

    // Mode 1: Manual Verifier request
    const mode1Res = await request(app, 'POST', '/verify/request', {
      walletId: 'w_unified_user',
      verifierId: 'bel-manual-gate-01',
      requestedFields: ['name', 'studentId', 'email'],
    });
    assert.equal(mode1Res.status, 201);
    assert.ok(mode1Res.body.requestId);

    // Mode 2: Developer SDK request
    const mode2Res = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_unified_user',
      requestedFields: ['name', 'studentId', 'email'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });
    assert.equal(mode2Res.status, 201);
    assert.ok(mode2Res.body.requestId);

    // Verify both requests are stored in the Unified Verification Request Store with status PENDING
    const storedRequests = JSON.parse(await fs.readFile(paths.VERIFICATION_REQUEST_DATA_FILE, 'utf8'));
    assert.equal(storedRequests.length, 2);

    const req1 = storedRequests.find((r) => r.requestId === mode1Res.body.requestId);
    const req2 = storedRequests.find((r) => r.requestId === mode2Res.body.requestId);

    assert.equal(req1.status, 'PENDING');
    assert.equal(req1.verifierId, 'bel-manual-gate-01');
    assert.deepEqual(req1.requestedFields, ['name', 'studentId', 'email']);

    assert.equal(req2.status, 'PENDING');
    assert.equal(req2.verifierId, devApp.appId);
    assert.deepEqual(req2.requestedFields, ['name', 'studentId', 'email']);

    // Neither creation response exposes credential data
    assert.equal(mode1Res.body.credentials, undefined);
    assert.equal(mode2Res.body.credentials, undefined);
  });

  it('Mode 1 and Mode 2 both route through the SAME user consent engine with selective disclosure', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);
    const devApp = await seedDeveloperApp(app);

    // Create Mode 1 request
    const m1Req = await request(app, 'POST', '/verify/request', {
      walletId: 'w_unified_user',
      verifierId: 'bel-manual-gate-02',
      requestedFields: ['name', 'studentId', 'email', 'phone'],
    });

    // Create Mode 2 request
    const m2Req = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_unified_user',
      requestedFields: ['name', 'studentId', 'email', 'phone'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });

    // User approves selectively: ['name', 'studentId'] — withholding ['email', 'phone']
    const consent1 = await request(app, 'POST', '/verify/consent', {
      requestId: m1Req.body.requestId,
      approvedFields: ['name', 'studentId'],
    });

    const consent2 = await request(app, 'POST', '/verify/consent', {
      requestId: m2Req.body.requestId,
      approvedFields: ['name', 'studentId'],
    });

    // Both return identical outcome structures from the Unified Consent Engine
    assert.equal(consent1.status, 200);
    assert.equal(consent1.body.verified, true);
    assert.deepEqual(consent1.body.data, { name: 'Rohan Verma', studentId: 'BEL-2026-88' });

    assert.equal(consent2.status, 200);
    assert.equal(consent2.body.verified, true);
    assert.deepEqual(consent2.body.data, { name: 'Rohan Verma', studentId: 'BEL-2026-88' });

    // Verify unapproved fields ('email', 'phone') are NEVER returned in data
    assert.equal(consent1.body.data.email, undefined);
    assert.equal(consent1.body.data.phone, undefined);
    assert.equal(consent2.body.data.email, undefined);
    assert.equal(consent2.body.data.phone, undefined);

    // Verify both logged disclosure entries in the user wallet with identical metadata schema
    const storedWallets = JSON.parse(await fs.readFile(paths.WALLET_DATA_FILE, 'utf8'));
    const userWallet    = storedWallets.find((w) => w.walletId === 'w_unified_user');
    assert.equal(userWallet.disclosureHistory.length, 2);

    const log1 = userWallet.disclosureHistory[0];
    const log2 = userWallet.disclosureHistory[1];

    assert.equal(log1.verifierId, 'bel-manual-gate-02');
    assert.equal(log1.outcome, 'APPROVED');
    assert.deepEqual(log1.disclosedFields, ['name', 'studentId']);
    assert.deepEqual(log1.withheldFields, ['email', 'phone']);

    assert.equal(log2.verifierId, devApp.appId);
    assert.equal(log2.outcome, 'APPROVED');
    assert.deepEqual(log2.disclosedFields, ['name', 'studentId']);
    assert.deepEqual(log2.withheldFields, ['email', 'phone']);
  });

  it('Mode 1 and Mode 2 enforce identical DENIED outcome when user declines consent', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);
    const devApp = await seedDeveloperApp(app);

    const m1Req = await request(app, 'POST', '/verify/request', {
      walletId: 'w_unified_user',
      verifierId: 'bel-manual-gate-03',
      requestedFields: ['name', 'phone'],
    });

    const m2Req = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_unified_user',
      requestedFields: ['name', 'phone'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });

    // User denies both by approving empty list []
    const consent1 = await request(app, 'POST', '/verify/consent', {
      requestId: m1Req.body.requestId,
      approvedFields: [],
    });

    const consent2 = await request(app, 'POST', '/verify/consent', {
      requestId: m2Req.body.requestId,
      approvedFields: [],
    });

    assert.equal(consent1.body.verified, false);
    assert.deepEqual(consent1.body.data, {});

    assert.equal(consent2.body.verified, false);
    assert.deepEqual(consent2.body.data, {});

    const storedWallets = JSON.parse(await fs.readFile(paths.WALLET_DATA_FILE, 'utf8'));
    const userWallet    = storedWallets.find((w) => w.walletId === 'w_unified_user');

    const log1 = userWallet.disclosureHistory.find((l) => l.requestId === m1Req.body.requestId);
    const log2 = userWallet.disclosureHistory.find((l) => l.requestId === m2Req.body.requestId);

    assert.equal(log1.outcome, 'DENIED');
    assert.deepEqual(log1.disclosedFields, []);
    assert.deepEqual(log1.withheldFields, ['name', 'phone']);

    assert.equal(log2.outcome, 'DENIED');
    assert.deepEqual(log2.disclosedFields, []);
    assert.deepEqual(log2.withheldFields, ['name', 'phone']);
  });

  it('Status polling (GET /verify/request/:requestId) enforces identical privacy isolation for both modes', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);
    const devApp = await seedDeveloperApp(app);

    const m1Req = await request(app, 'POST', '/verify/request', {
      walletId: 'w_unified_user',
      verifierId: 'bel-manual-gate-04',
      requestedFields: ['name', 'dob'],
    });

    const m2Req = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_unified_user',
      requestedFields: ['name', 'dob'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });

    // 1. While PENDING — polling returns NO credential data for either mode
    const poll1Pending = await request(app, 'GET', `/verify/request/${m1Req.body.requestId}`);
    const poll2Pending = await request(app, 'GET', `/verify/request/${m2Req.body.requestId}`);

    assert.equal(poll1Pending.body.status, 'PENDING');
    assert.equal(poll1Pending.body.disclosedData, undefined);

    assert.equal(poll2Pending.body.status, 'PENDING');
    assert.equal(poll2Pending.body.disclosedData, undefined);

    // 2. User approves ONLY 'name' (withholds 'dob')
    await request(app, 'POST', '/verify/consent', { requestId: m1Req.body.requestId, approvedFields: ['name'] });
    await request(app, 'POST', '/verify/consent', { requestId: m2Req.body.requestId, approvedFields: ['name'] });

    // 3. After APPROVED — polling returns ONLY approved fields for both modes
    const poll1Approved = await request(app, 'GET', `/verify/request/${m1Req.body.requestId}`);
    const poll2Approved = await request(app, 'GET', `/verify/request/${m2Req.body.requestId}`);

    assert.equal(poll1Approved.body.status, 'APPROVED');
    assert.deepEqual(poll1Approved.body.disclosedData, { name: 'Rohan Verma' });
    assert.deepEqual(poll1Approved.body.withheldFields, ['dob']);

    assert.equal(poll2Approved.body.status, 'APPROVED');
    assert.deepEqual(poll2Approved.body.disclosedData, { name: 'Rohan Verma' });
    assert.deepEqual(poll2Approved.body.withheldFields, ['dob']);

    // Neither mode ever receives walletId or raw wallet credentials object
    assert.equal(poll1Approved.body.walletId, undefined);
    assert.equal(poll2Approved.body.walletId, undefined);
  });

  it('Both Mode 1 and Mode 2 enforce identical input validation via the Unified Engine', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);
    const devApp = await seedDeveloperApp(app);

    // Invalid walletId
    const m1InvalidWallet = await request(app, 'POST', '/verify/request', {
      walletId: 'w_nonexistent',
      verifierId: 'bel-gate',
      requestedFields: ['name'],
    });
    const m2InvalidWallet = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_nonexistent',
      requestedFields: ['name'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });

    assert.equal(m1InvalidWallet.status, 404);
    assert.equal(m2InvalidWallet.status, 404);

    // Unsupported requested field
    const m1BadField = await request(app, 'POST', '/verify/request', {
      walletId: 'w_unified_user',
      verifierId: 'bel-gate',
      requestedFields: ['unsupported_field_xyz'],
    });
    const m2BadField = await request(app, 'POST', '/developer/verify', {
      walletId: 'w_unified_user',
      requestedFields: ['unsupported_field_xyz'],
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });

    assert.equal(m1BadField.status, 400);
    assert.equal(m2BadField.status, 400);
  });
});
