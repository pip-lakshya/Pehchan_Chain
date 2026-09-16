/**
 * Manager Asset-Assignment Workflow — Integration Tests
 *
 * Verifies end-to-end Manager asset assignment workflow:
 *   1. Admin creates/mints an asset (VALID -> 201 Created)
 *   2. Manager attempts to mint an asset (INVALID -> 403 Forbidden)
 *   3. Manager assigns an existing asset to target user DID (VALID -> 200 OK)
 *   4. User wallet queries assets by DID (VALID -> Returns assigned asset)
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('assert/strict');
const app = require('../src/app');
const { mockStore } = require('../src/services/assetService');
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

describe('Manager Asset-Assignment Workflow', () => {
  const adminDID = 'did:pehchan:admin_workspace';
  const managerDID = 'did:pehchan:manager_workspace';
  const userDID = 'did:pehchan:user_student_007';

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

  beforeEach(async () => {
    mockStore.reset();
    mockRoleStore.reset();

    // Setup roles
    await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({ targetDID: adminDID, role: 'ADMIN' }),
    });
    await request('/role/assign', {
      method: 'POST',
      body: JSON.stringify({ targetDID: managerDID, role: 'MANAGER' }),
    });
  });

  it('VALID: Admin creates/mints an asset successfully', async () => {
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: adminDID,
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: adminDID,
        name: 'BEL Security Access Token',
        category: 'ACCESS_CARD',
      }),
    });

    assert.equal(mintRes.status, 201);
    assert.equal(mintRes.body.status, 'success');
    assert.ok(mintRes.body.data.tokenId);
    assert.equal(mintRes.body.data.targetDID, adminDID);
  });

  it('INVALID: Manager attempts to mint asset -> Must fail (403 Forbidden)', async () => {
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: managerDID,
        recipient: '0x2222222222222222222222222222222222222222',
        targetDID: managerDID,
        name: 'Unauthorized Asset',
        category: 'ILLEGAL_MINT',
      }),
    });

    assert.equal(mintRes.status, 403);
    assert.equal(mintRes.body.error, 'Request Error');
    assert.match(mintRes.body.message, /Admin role required for asset minting/);
    assert.match(mintRes.body.message, /Manager accounts cannot mint new assets/);
  });

  it('VALID: Manager assigns existing asset -> Confirmed & user wallet displays asset', async () => {
    // 1. Admin mints an asset
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: adminDID,
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: adminDID,
        name: 'Defense Project Clearance ID',
        category: 'SECURITY_CLEARANCE',
      }),
    });

    const tokenId = mintRes.body.data.tokenId;

    // 2. Manager selects existing asset & assigns to user's DID
    const transferRes = await request('/asset/transfer', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: managerDID,
        tokenId,
        recipient: '0x3333333333333333333333333333333333333333',
        targetDID: userDID,
      }),
    });

    assert.equal(transferRes.status, 200);
    assert.equal(transferRes.body.status, 'success');
    assert.equal(transferRes.body.data.tokenId, tokenId);
    assert.equal(transferRes.body.data.targetDID, userDID);
    assert.ok(transferRes.body.data.transactionHash);

    // 3. User wallet queries assets by DID -> displays assigned asset
    const walletRes = await request(`/asset/identity/${encodeURIComponent(userDID)}`);

    assert.equal(walletRes.status, 200);
    assert.equal(walletRes.body.data.targetDID, userDID);
    assert.ok(walletRes.body.data.tokenIds.includes(tokenId));
    assert.equal(walletRes.body.data.assets[0].name, 'Defense Project Clearance ID');
    assert.equal(walletRes.body.data.assets[0].category, 'SECURITY_CLEARANCE');
  });

  it('INVALID: Unauthorized User (without Admin or Manager role) attempts asset transfer -> Must fail (403)', async () => {
    // 1. Admin mints asset
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: adminDID,
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: adminDID,
        name: 'Restricted Token',
        category: 'LICENSE',
      }),
    });
    const tokenId = mintRes.body.data.tokenId;

    // 2. User attempts to transfer asset
    const transferRes = await request('/asset/transfer', {
      method: 'POST',
      body: JSON.stringify({
        requesterDID: userDID,
        tokenId,
        recipient: '0x4444444444444444444444444444444444444444',
        targetDID: 'did:pehchan:stranger',
      }),
    });

    assert.equal(transferRes.status, 403);
    assert.match(transferRes.body.message, /Admin or Manager role required for asset transfer/);
  });
});
