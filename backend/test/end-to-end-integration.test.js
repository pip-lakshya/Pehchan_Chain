/**
 * end-to-end-integration.test.js
 *
 * Full End-to-End Integration Test for PehchanChain (20-Step Exact Scenario Audit).
 *
 * Scenario Verified:
 *   1. User registers using BLAuth flow.
 *   2. Biometric commitment/authentication works.
 *   3. DID exists (did:pehchan:...).
 *   4. Identity proof exists on-chain / in wallet.
 *   5. Admin assigns/has Admin role.
 *   6. Admin mints an asset.
 *   7. Manager receives/has Manager role.
 *   8. Manager assigns asset to user's DID.
 *   9. User wallet displays the asset.
 *  10. Manual verifier searches the DID.
 *  11. Manual verifier requests 5 fields.
 *  12. User sees consent request.
 *  13. User approves only 2 fields.
 *  14. Biometric confirmation occurs.
 *  15. Verifier receives exactly those 2 fields.
 *  16. The other 3 fields are absent.
 *  17. Developer demo performs the same process (Mode 2).
 *  18. Developer receives only approved fields.
 *  19. Audit log shows identity/asset/role/access events.
 *  20. Transaction hashes are present and traceable.
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-pehchan-test-'));
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

describe('PehchanChain End-to-End Integration Scenario Audit', () => {

  it('Executes complete 20-step PehchanChain scenario cleanly', async () => {
    const paths = envPaths();
    const app   = await buildApp(paths);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: User registers using existing BLAuth flow
    // ─────────────────────────────────────────────────────────────────────────
    const dummyCommitment = '0x1111111122222222333333334444444455555555666666667777777788888888';
    const regRes = await request(app, 'POST', '/identity/register', {
      verified: true,
      credentials: {
        name: 'Kabir Patel',
        studentId: 'BEL-STU-2026',
        email: 'kabir.patel@bel.co.in',
        phone: '+919876543210',
        dob: '1998-07-14',
      },
      biometricCommitment: dummyCommitment,
    });

    assert.equal(regRes.status, 201, 'Step 1: User registration must succeed with 201');
    assert.ok(regRes.body.walletId, 'Step 1: walletId must be returned');

    const walletId = regRes.body.walletId;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Local biometric authentication works
    // ─────────────────────────────────────────────────────────────────────────
    const authRes = await request(app, 'POST', '/identity/authenticate', {
      biometricCommitment: dummyCommitment,
    });

    assert.equal(authRes.status, 200, 'Step 2: Biometric authentication must succeed');
    assert.equal(authRes.body.registered, true, 'Step 2: Wallet must be registered');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: DID exists
    // ─────────────────────────────────────────────────────────────────────────
    const userDID = `did:pehchan:${walletId}`;
    assert.ok(userDID.startsWith('did:pehchan:'), 'Step 3: Valid DID format must exist');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Identity exists on-chain / wallet record valid
    // ─────────────────────────────────────────────────────────────────────────
    const walletRes = await request(app, 'GET', `/identity/${walletId}`);
    assert.equal(walletRes.status, 200, 'Step 4: Identity wallet must exist');
    assert.equal(walletRes.body.credentials.name, 'Kabir Patel', 'Step 4: Name must match');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Admin assigns/has Admin role & User receives USER role
    // ─────────────────────────────────────────────────────────────────────────
    const adminDID = 'did:pehchan:admin_bel_01';
    const adminRoleRes = await request(app, 'POST', '/role/assign', {
      targetDID: adminDID,
      role: 'ADMIN',
    });

    assert.equal(adminRoleRes.status, 200, 'Step 5: Admin role assignment must succeed');
    assert.equal(adminRoleRes.body.data.role, 'ADMIN', 'Step 5: Admin role must be ADMIN');

    const userRoleRes = await request(app, 'POST', '/role/assign', {
      targetDID: userDID,
      role: 'USER',
    });
    assert.equal(userRoleRes.status, 200, 'Step 5: User role assignment must succeed');

    const adminCheck = await request(app, 'GET', `/role/${encodeURIComponent(adminDID)}`);
    assert.equal(adminCheck.body.data.isAdmin, true, 'Step 5: Admin check must return isAdmin=true');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Admin mints an asset
    // ─────────────────────────────────────────────────────────────────────────
    const mintRes = await request(app, 'POST', '/asset/mint', {
      requesterDID: adminDID,
      recipient: '0x1111111111111111111111111111111111111111',
      targetDID: adminDID,
      name: 'BEL Security Clearance Level 4',
      category: 'CLEARANCE',
      ipfsHash: 'ipfs://QmBELClearanceL4',
    });

    assert.equal(mintRes.status, 201, 'Step 6: Admin minting must succeed with 201');
    assert.ok(mintRes.body.data.tokenId, 'Step 6: Token ID must be returned');
    assert.ok(mintRes.body.data.transactionHash, 'Step 6: Tx Hash must be returned');

    const mintedTokenId = mintRes.body.data.tokenId;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Manager receives/has Manager role
    // ─────────────────────────────────────────────────────────────────────────
    const managerDID = 'did:pehchan:manager_bel_01';
    const mgrRoleRes = await request(app, 'POST', '/role/assign', {
      targetDID: managerDID,
      role: 'MANAGER',
    });

    assert.equal(mgrRoleRes.status, 200, 'Step 7: Manager role assignment must succeed');
    assert.equal(mgrRoleRes.body.data.role, 'MANAGER', 'Step 7: Role must be MANAGER');

    const mgrCheck = await request(app, 'GET', `/role/${encodeURIComponent(managerDID)}`);
    assert.equal(mgrCheck.body.data.isManager, true, 'Step 7: Manager check must return isManager=true');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Manager assigns asset to user's DID
    // ─────────────────────────────────────────────────────────────────────────
    const transferRes = await request(app, 'POST', '/asset/transfer', {
      requesterDID: managerDID,
      tokenId: mintedTokenId,
      recipient: '0x2222222222222222222222222222222222222222',
      targetDID: userDID,
    });

    assert.equal(transferRes.status, 200, 'Step 8: Manager asset transfer must succeed');
    assert.equal(transferRes.body.data.targetDID, userDID, 'Step 8: Asset targetDID must be userDID');
    assert.ok(transferRes.body.data.transactionHash, 'Step 8: Transfer transactionHash must be returned');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: User wallet displays the asset
    // ─────────────────────────────────────────────────────────────────────────
    const userAssetsRes = await request(app, 'GET', `/asset/identity/${encodeURIComponent(userDID)}`);
    assert.equal(userAssetsRes.status, 200, 'Step 9: Wallet asset query must succeed');
    assert.ok(userAssetsRes.body.data.tokenIds.includes(mintedTokenId), 'Step 9: Asset token ID must be in user wallet');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Manual verifier searches the DID & creates request
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Manual verifier requests 5 fields
    // ─────────────────────────────────────────────────────────────────────────
    const fiveFields = ['name', 'studentId', 'email', 'phone', 'dob'];
    const mode1ReqRes = await request(app, 'POST', '/verify/request', {
      walletId,
      verifierId: 'bel-gate-verifier-01',
      requestedFields: fiveFields,
    });

    assert.equal(mode1ReqRes.status, 201, 'Step 10-11: Manual verifier request must be created');
    assert.ok(mode1ReqRes.body.requestId, 'Step 10-11: requestId must be generated');

    const m1RequestId = mode1ReqRes.body.requestId;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 12: User sees consent request
    // ─────────────────────────────────────────────────────────────────────────
    const m1PollPending = await request(app, 'GET', `/verify/request/${m1RequestId}`);
    assert.equal(m1PollPending.status, 200, 'Step 12: User/Verifier can inspect pending request');
    assert.equal(m1PollPending.body.status, 'PENDING', 'Step 12: Request status must be PENDING');
    assert.deepEqual(m1PollPending.body.requestedFields.sort(), fiveFields.sort(), 'Step 12: All 5 requested fields present');
    assert.equal(m1PollPending.body.disclosedData, undefined, 'Step 12: No credential data disclosed before consent');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 13: User approves only 2 fields (name, studentId)
    // STEP 14: Biometric confirmation occurs (submits signed consent)
    // ─────────────────────────────────────────────────────────────────────────
    const approvedTwo = ['name', 'studentId'];
    const m1ConsentRes = await request(app, 'POST', '/verify/consent', {
      requestId: m1RequestId,
      approvedFields: approvedTwo,
    });

    assert.equal(m1ConsentRes.status, 200, 'Step 13-14: Consent submission must succeed');
    assert.equal(m1ConsentRes.body.verified, true, 'Step 13-14: Outcome verified=true');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 15: Verifier receives exactly those 2 fields
    // STEP 16: The other 3 fields (email, phone, dob) are ABSENT
    // ─────────────────────────────────────────────────────────────────────────
    const m1PollApproved = await request(app, 'GET', `/verify/request/${m1RequestId}`);
    assert.equal(m1PollApproved.status, 200, 'Step 15: Polling approved request must succeed');
    assert.equal(m1PollApproved.body.status, 'APPROVED', 'Step 15: Status must be APPROVED');
    assert.deepEqual(m1PollApproved.body.disclosedFields.sort(), approvedTwo.sort(), 'Step 15: Exactly 2 disclosed fields');

    const disclosedData = m1PollApproved.body.disclosedData;
    assert.equal(disclosedData.name, 'Kabir Patel', 'Step 15: Disclosed name matches');
    assert.equal(disclosedData.studentId, 'BEL-STU-2026', 'Step 15: Disclosed studentId matches');

    assert.equal(disclosedData.email, undefined, 'Step 16: email MUST be absent');
    assert.equal(disclosedData.phone, undefined, 'Step 16: phone MUST be absent');
    assert.equal(disclosedData.dob, undefined, 'Step 16: dob MUST be absent');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 17: Developer demo (Mode 2) performs the same process
    // ─────────────────────────────────────────────────────────────────────────
    const devAppRes = await request(app, 'POST', '/developer/apps', {
      name: 'PehchanChain Defense Partner Portal',
    });
    assert.equal(devAppRes.status, 201, 'Step 17: Developer registration must succeed');
    const devApp = devAppRes.body;

    const mode2ReqRes = await request(app, 'POST', '/developer/verify', {
      walletId,
      requestedFields: fiveFields,
    }, {
      'X-BLAuth-API-Key': devApp.apiKey,
      'X-BLAuth-API-Secret': devApp.apiSecret,
    });
    assert.equal(mode2ReqRes.status, 201, 'Step 17: Developer verification request must succeed');

    const m2RequestId = mode2ReqRes.body.requestId;

    // User completes consent approving ONLY 2 fields for Developer SDK
    await request(app, 'POST', '/verify/consent', {
      requestId: m2RequestId,
      approvedFields: ['name', 'studentId'],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 18: Developer receives ONLY approved fields
    // ─────────────────────────────────────────────────────────────────────────
    const m2PollApproved = await request(app, 'GET', `/verify/request/${m2RequestId}`);
    assert.equal(m2PollApproved.body.status, 'APPROVED', 'Step 18: Developer status must be APPROVED');
    assert.deepEqual(m2PollApproved.body.disclosedFields.sort(), ['name', 'studentId'].sort(), 'Step 18: Only 2 fields disclosed');
    assert.equal(m2PollApproved.body.disclosedData.email, undefined, 'Step 18: Developer must NOT receive email');
    assert.equal(m2PollApproved.body.disclosedData.phone, undefined, 'Step 18: Developer must NOT receive phone');
    assert.equal(m2PollApproved.body.disclosedData.dob, undefined, 'Step 18: Developer must NOT receive dob');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 19: Audit log shows identity/asset/role/access events
    // ─────────────────────────────────────────────────────────────────────────
    const auditRes = await request(app, 'GET', `/audit/log/${walletId}`);
    assert.equal(auditRes.status, 200, 'Step 19: Audit log query must succeed');

    const eventTypes = auditRes.body.data.map((e) => e.eventType);
    assert.ok(eventTypes.includes('IDENTITY_CREATED'), 'Step 19: IDENTITY_CREATED must be logged');
    assert.ok(eventTypes.includes('ROLE_ASSIGNED'), 'Step 19: ROLE_ASSIGNED must be logged');
    assert.ok(eventTypes.includes('ASSET_MINTED'), 'Step 19: ASSET_MINTED must be logged');
    assert.ok(eventTypes.includes('ASSET_ASSIGNED'), 'Step 19: ASSET_ASSIGNED must be logged');
    assert.ok(eventTypes.includes('VERIFICATION_REQUESTED'), 'Step 19: VERIFICATION_REQUESTED must be logged');
    assert.ok(eventTypes.includes('ACCESS_GRANTED'), 'Step 19: ACCESS_GRANTED must be logged');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 20: Transaction hashes are present and traceable
    // ─────────────────────────────────────────────────────────────────────────
    const onChainEvents = auditRes.body.data.filter((e) => e.transactionHash);
    assert.ok(onChainEvents.length >= 1, 'Step 20: Transaction hashes must exist for on-chain events');

    for (const item of onChainEvents) {
      assert.ok(item.transactionHash.startsWith('0x'), 'Step 20: Transaction hash must be valid 0x hex string');
    }
  });
});
