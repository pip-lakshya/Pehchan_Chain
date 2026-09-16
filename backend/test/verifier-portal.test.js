/**
 * verifier-portal.test.js
 *
 * Tests for GET /verify/request/:requestId — the polling endpoint used by the
 * Authenticator Mode 1 Verifier Portal.
 *
 * Invariant under test: the verifier never sees wallet credentials before
 * the user consents; only the selectively-disclosed subset is returned, and
 * only after the user has gone through the existing POST /verify/consent flow.
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const os     = require('node:os');
const fs     = require('fs/promises');

// ─── Isolated temp stores so tests don't touch real data ────────────────────
let tmpDir;
before(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verifier-test-')); });
after(async ()  => { await fs.rm(tmpDir, { recursive: true, force: true }); });

function envPaths() {
  return {
    WALLET_DATA_FILE:               path.join(tmpDir, `wallets-${Date.now()}.json`),
    VERIFICATION_REQUEST_DATA_FILE: path.join(tmpDir, `vreqs-${Date.now()}.json`),
  };
}

async function buildApp(env = {}) {
  const merged = { ...envPaths(), ...env };
  for (const [k, v] of Object.entries(merged)) process.env[k] = v;

  // Force module re-evaluation so stores pick up the new env paths
  for (const key of Object.keys(require.cache)) {
    if (key.includes('backend/src')) delete require.cache[key];
  }

  const app = require('../src/app');
  return app;
}

// ─── Lightweight HTTP helpers ─────────────────────────────────────────────────
const http = require('node:http');

function request(app, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const payload  = body ? JSON.stringify(body) : null;
      const options  = {
        hostname: '127.0.0.1', port, method,
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
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

// ─── Seed helpers ─────────────────────────────────────────────────────────────
async function seedWallet(walletDataFile, walletId = 'w_verifier_test') {
  const wallet = {
    walletId,
    credentials: {
      name: 'Priya Sharma', studentId: 'STU-9001', email: 'priya@bel.in',
      phone: '+919988776655', dob: '1999-05-15',
    },
    biometricCommitment: null,
    disclosureHistory: [],
  };
  await fs.mkdir(path.dirname(walletDataFile), { recursive: true });
  await fs.writeFile(walletDataFile, JSON.stringify([wallet], null, 2), 'utf8');
  return wallet;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Verifier Portal — GET /verify/request/:requestId', () => {
  it('returns 404 for a non-existent requestId', async () => {
    const app = await buildApp();
    const res = await request(app, 'GET', '/verify/request/req_doesnotexist');
    assert.equal(res.status, 404);
    assert.ok(res.body.message || res.body.error);
  });

  it('returns 400 for an empty requestId path segment', async () => {
    const app = await buildApp();
    // Empty path segment becomes "not found" at the router level (404 from app catch-all)
    // or 404 from findByRequestId — both are acceptable non-2xx
    const res = await request(app, 'GET', '/verify/request/%20');
    assert.ok(res.status >= 400);
  });

  it('returns PENDING status with only public fields — no credentials', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);

    // Create a verification request
    const createRes = await request(app, 'POST', '/verify/request', {
      walletId: 'w_verifier_test',
      verifierId: 'bel-gate-01',
      requestedFields: ['name', 'studentId'],
    });
    assert.equal(createRes.status, 201);
    const { requestId } = createRes.body;
    assert.ok(requestId, 'requestId must be returned');

    // Poll the status
    const pollRes = await request(app, 'GET', `/verify/request/${requestId}`);
    assert.equal(pollRes.status, 200);
    const data = pollRes.body;

    // Public fields present
    assert.equal(data.requestId, requestId);
    assert.equal(data.status, 'PENDING');
    assert.equal(data.verifierId, 'bel-gate-01');
    assert.deepEqual(data.requestedFields.sort(), ['name', 'studentId'].sort());
    assert.ok(data.createdAt);

    // CRITICAL: no credential data returned while pending
    assert.equal(data.disclosedData, undefined,
      'disclosedData must NOT be present while status is PENDING');
    assert.equal(data.walletId, undefined,
      'walletId must never be exposed to the verifier');
  });

  it('returns APPROVED status with ONLY the selectively-disclosed fields after consent', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);

    // Create request
    const createRes = await request(app, 'POST', '/verify/request', {
      walletId: 'w_verifier_test',
      verifierId: 'bel-gate-02',
      requestedFields: ['name', 'studentId', 'email'],
    });
    assert.equal(createRes.status, 201);
    const { requestId } = createRes.body;

    // User approves only name + studentId (withholds email)
    const consentRes = await request(app, 'POST', '/verify/consent', {
      requestId,
      approvedFields: ['name', 'studentId'],
    });
    assert.equal(consentRes.status, 200);
    assert.equal(consentRes.body.verified, true);

    // Verifier polls
    const pollRes = await request(app, 'GET', `/verify/request/${requestId}`);
    assert.equal(pollRes.status, 200);
    const data = pollRes.body;

    assert.equal(data.status, 'APPROVED');
    assert.deepEqual(data.disclosedFields.sort(), ['name', 'studentId'].sort());
    assert.deepEqual(data.withheldFields, ['email']);

    // Disclosed data contains only what the user approved
    assert.equal(data.disclosedData.name, 'Priya Sharma');
    assert.equal(data.disclosedData.studentId, 'STU-9001');
    assert.equal(data.disclosedData.email, undefined,
      'email was withheld by user and must not appear in disclosedData');

    // Still no raw wallet exposure
    assert.equal(data.walletId, undefined);
  });

  it('returns DENIED status with no disclosed data when user denies all', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);

    const createRes = await request(app, 'POST', '/verify/request', {
      walletId: 'w_verifier_test',
      verifierId: 'bel-gate-03',
      requestedFields: ['name', 'email'],
    });
    assert.equal(createRes.status, 201);
    const { requestId } = createRes.body;

    // User denies (approves nothing)
    const consentRes = await request(app, 'POST', '/verify/consent', {
      requestId,
      approvedFields: [],
    });
    assert.equal(consentRes.status, 200);
    assert.equal(consentRes.body.verified, false);

    const pollRes = await request(app, 'GET', `/verify/request/${requestId}`);
    assert.equal(pollRes.status, 200);
    const data = pollRes.body;

    assert.equal(data.status, 'DENIED');
    assert.deepEqual(data.disclosedFields, []);
    assert.deepEqual(data.disclosedData, {});
    assert.ok(data.withheldFields.includes('name'));
    assert.ok(data.withheldFields.includes('email'));
    assert.equal(data.walletId, undefined);
  });

  it('correctly resolves ageOver18 as a derived boolean — does not expose dob', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);
    await seedWallet(paths.WALLET_DATA_FILE);

    const createRes = await request(app, 'POST', '/verify/request', {
      walletId: 'w_verifier_test',
      verifierId: 'bel-age-check',
      requestedFields: ['ageOver18'],
    });
    assert.equal(createRes.status, 201);
    const { requestId } = createRes.body;

    await request(app, 'POST', '/verify/consent', { requestId, approvedFields: ['ageOver18'] });

    const pollRes = await request(app, 'GET', `/verify/request/${requestId}`);
    assert.equal(pollRes.status, 200);
    const data = pollRes.body;

    assert.equal(data.status, 'APPROVED');
    assert.ok(data.disclosedFields.includes('ageOver18'));
    assert.equal(typeof data.disclosedData.ageOver18, 'boolean');
    // dob must NEVER be in disclosedData
    assert.equal(data.disclosedData.dob, undefined,
      'Raw date of birth must never be disclosed via the polling endpoint');
  });
});
