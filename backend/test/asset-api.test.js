/**
 * PehchanChain Asset API — Backend HTTP integration tests
 *
 * Uses node:test + native fetch against Express app.
 * Tests endpoints:
 *   - POST /asset/mint
 *   - POST /asset/transfer
 *   - GET /asset/owner/:tokenId
 *   - GET /asset/identity/:did
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('assert/strict');
const app = require('../src/app');
const { mockStore } = require('../src/services/assetService');

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

describe('PehchanChain Asset API', () => {
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
    mockStore.reset();
  });

  // ── POST /asset/mint ───────────────────────────────────────────────────────

  it('POST /asset/mint succeeds with valid payload', async () => {
    const payload = {
      recipient: '0x1111111111111111111111111111111111111111',
      targetDID: 'did:pehchan:wallet_test123',
      name: 'Degree Certificate NFT',
      category: 'CERTIFICATE',
      ipfsHash: 'ipfs://QmTestCert123',
      payloadHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'success');
    assert.ok(res.body.data.tokenId);
    assert.equal(res.body.data.recipient, payload.recipient);
    assert.equal(res.body.data.targetDID, payload.targetDID);
    assert.ok(res.body.data.transactionHash);
  });

  it('POST /asset/mint rejects missing recipient', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        targetDID: 'did:pehchan:wallet_test123',
        name: 'Asset',
        category: 'CREDENTIAL',
      }),
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Request Error');
    assert.match(res.body.message, /recipient is required/);
  });

  it('POST /asset/mint rejects invalid recipient address', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: 'invalid-eth-address',
        targetDID: 'did:pehchan:wallet_test123',
        name: 'Asset',
        category: 'CREDENTIAL',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid Ethereum address/);
  });

  it('POST /asset/mint rejects missing targetDID', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        name: 'Asset',
        category: 'CREDENTIAL',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /targetDID is required/);
  });

  it('POST /asset/mint rejects invalid DID format', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: 'not-a-valid-did',
        name: 'Asset',
        category: 'CREDENTIAL',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid DID string/);
  });

  it('POST /asset/mint rejects missing name', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: 'did:pehchan:wallet_test123',
        category: 'CREDENTIAL',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /name is required/);
  });

  it('POST /asset/mint rejects missing category', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: 'did:pehchan:wallet_test123',
        name: 'Asset',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /category is required/);
  });

  it('POST /asset/mint rejects invalid payloadHash format', async () => {
    const res = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: 'did:pehchan:wallet_test123',
        name: 'Asset',
        category: 'CREDENTIAL',
        payloadHash: '0xshort',
      }),
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /valid 32-byte hex string/);
  });

  // ── GET /asset/owner/:tokenId ──────────────────────────────────────────────

  it('GET /asset/owner/:tokenId returns owner info for existing asset', async () => {
    // Mint asset first
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x2222222222222222222222222222222222222222',
        targetDID: 'did:pehchan:wallet_owner_test',
        name: 'Security Pass',
        category: 'LICENSE',
      }),
    });

    const tokenId = mintRes.body.data.tokenId;

    const res = await request(`/asset/owner/${tokenId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.tokenId, tokenId);
    assert.equal(res.body.data.ownerAddress, '0x2222222222222222222222222222222222222222');
    assert.equal(res.body.data.targetDID, 'did:pehchan:wallet_owner_test');
  });

  it('GET /asset/owner/:tokenId returns 404 for non-existent token', async () => {
    const res = await request('/asset/owner/99999');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Request Error');
  });

  it('GET /asset/owner/:tokenId rejects non-numeric token ID', async () => {
    const res = await request('/asset/owner/abc');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /positive integer/);
  });

  // ── POST /asset/transfer ───────────────────────────────────────────────────

  it('POST /asset/transfer transfers asset to new owner and DID', async () => {
    // Mint asset
    const mintRes = await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x1111111111111111111111111111111111111111',
        targetDID: 'did:pehchan:wallet_src',
        name: 'Transferable Asset',
        category: 'ASSET',
      }),
    });
    const tokenId = mintRes.body.data.tokenId;

    // Transfer asset
    const transferPayload = {
      tokenId,
      recipient: '0x3333333333333333333333333333333333333333',
      targetDID: 'did:pehchan:wallet_dst',
    };

    const transferRes = await request('/asset/transfer', {
      method: 'POST',
      body: JSON.stringify(transferPayload),
    });

    assert.equal(transferRes.status, 200);
    assert.equal(transferRes.body.status, 'success');
    assert.equal(transferRes.body.data.tokenId, tokenId);
    assert.equal(transferRes.body.data.newOwner, transferPayload.recipient);
    assert.equal(transferRes.body.data.targetDID, transferPayload.targetDID);

    // Verify owner updated
    const ownerRes = await request(`/asset/owner/${tokenId}`);
    assert.equal(ownerRes.body.data.ownerAddress, transferPayload.recipient);
    assert.equal(ownerRes.body.data.targetDID, transferPayload.targetDID);
  });

  it('POST /asset/transfer returns 404 for non-existent token', async () => {
    const res = await request('/asset/transfer', {
      method: 'POST',
      body: JSON.stringify({
        tokenId: '99999',
        recipient: '0x3333333333333333333333333333333333333333',
        targetDID: 'did:pehchan:wallet_dst',
      }),
    });

    assert.equal(res.status, 404);
  });

  // ── GET /asset/identity/:did ───────────────────────────────────────────────

  it('GET /asset/identity/:did returns all assets associated with DID', async () => {
    const did = 'did:pehchan:wallet_multi_asset';

    // Mint two assets for same DID
    await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x4444444444444444444444444444444444444444',
        targetDID: did,
        name: 'Asset 1',
        category: 'CERTIFICATE',
      }),
    });

    await request('/asset/mint', {
      method: 'POST',
      body: JSON.stringify({
        recipient: '0x4444444444444444444444444444444444444444',
        targetDID: did,
        name: 'Asset 2',
        category: 'LICENSE',
      }),
    });

    const res = await request(`/asset/identity/${encodeURIComponent(did)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.targetDID, did);
    assert.equal(res.body.data.tokenIds.length, 2);
    assert.equal(res.body.data.assets.length, 2);
    assert.equal(res.body.data.assets[0].name, 'Asset 1');
    assert.equal(res.body.data.assets[1].name, 'Asset 2');
  });

  it('GET /asset/identity/:did returns empty array for DID without assets', async () => {
    const did = 'did:pehchan:wallet_empty';
    const res = await request(`/asset/identity/${encodeURIComponent(did)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.targetDID, did);
    assert.deepEqual(res.body.data.tokenIds, []);
    assert.deepEqual(res.body.data.assets, []);
  });
});
