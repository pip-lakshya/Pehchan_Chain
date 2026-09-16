/**
 * PehchanAssetRegistry — Hardhat in-process tests
 *
 * Uses node:test + Hardhat's in-memory EVM + ethers.js v6.
 * No live network required. Tests run offline.
 *
 * Coverage:
 *  1.  Admin can mint an asset
 *  2.  Unauthorized account cannot mint (reverts)
 *  3.  Minted asset exists (ownerOf returns correct address)
 *  4.  Asset is associated with the correct DID
 *  5.  Ownership can be queried (getAssetOwner)
 *  6.  getAssetsByDID returns the correct token list
 *  7.  Admin can assignAsset (transfer to new owner + new DID)
 *  8.  Authorized Manager can assignAsset
 *  9.  Unauthorized caller cannot assignAsset (reverts)
 * 10.  Non-existent token assignAsset reverts
 * 11.  AssetMinted event is emitted with correct args
 * 12.  AssetAssigned event is emitted with correct args
 * 13.  DID index is updated correctly after assignment
 * 14.  totalAssets() increments correctly
 * 15.  Admin can authorize and revoke a manager
 * 16.  Revoked manager cannot assignAsset
 * 17.  Admin can transfer admin role; old admin loses privileges
 * 18.  setCredentialRegistry updates the stored address
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('assert/strict');
const { ethers } = require('ethers');
const hre = require('hardhat');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deploy a fresh PehchanAssetRegistry and return { contract, admin, accounts } */
async function deployFresh() {
  const provider = new ethers.BrowserProvider(hre.network.provider);

  // Hardhat in-process network pre-funds signers [0..19]
  const admin = await provider.getSigner(0);
  const manager = await provider.getSigner(1);
  const user1 = await provider.getSigner(2);
  const user2 = await provider.getSigner(3);
  const stranger = await provider.getSigner(4);

  const artifact = await hre.artifacts.readArtifact('PehchanAssetRegistry');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin);
  const contract = await factory.deploy(
    'PehchanAsset',
    'PCNA',
    await admin.getAddress(),
    ethers.ZeroAddress,
  );
  await contract.waitForDeployment();

  return { contract, provider, admin, manager, user1, user2, stranger };
}

/** Reusable mint call with default DID/asset params */
async function mintOne(contract, adminSigner, recipientAddress, did = 'did:pehchan:wallet_abc123') {
  const tx = await contract.connect(adminSigner).mintAsset(
    recipientAddress,
    did,
    'Test Asset',
    'CREDENTIAL',
    'ipfs://QmTestHash',
    ethers.id('payload-data'), // bytes32 data hash
  );
  const receipt = await tx.wait();
  // Extract tokenId from AssetMinted log
  const iface = contract.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'AssetMinted') {
        return { tokenId: parsed.args.tokenId, receipt, parsed };
      }
    } catch {
      // skip non-matching logs
    }
  }
  throw new Error('AssetMinted event not found in receipt');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PehchanAssetRegistry', () => {
  let contract;
  let admin;
  let manager;
  let user1;
  let user2;
  let stranger;

  before(async () => {
    ({ contract, admin, manager, user1, user2, stranger } = await deployFresh());
  });

  // -------------------------------------------------------------------------
  // 1. Admin can mint
  // -------------------------------------------------------------------------
  it('admin can mint an asset and receives a tokenId ≥ 1', async () => {
    const user1Addr = await user1.getAddress();
    const { tokenId } = await mintOne(contract, admin, user1Addr);
    assert.ok(tokenId >= 1n, `expected tokenId ≥ 1, got ${tokenId}`);
  });

  // -------------------------------------------------------------------------
  // 2. Unauthorized cannot mint
  // -------------------------------------------------------------------------
  it('non-admin cannot mint (reverts with access-control message)', async () => {
    const user1Addr = await user1.getAddress();
    await assert.rejects(
      () => contract.connect(stranger).mintAsset(
        user1Addr,
        'did:pehchan:wallet_stranger',
        'Bad Asset',
        'CREDENTIAL',
        '',
        ethers.id('x'),
      ),
      /caller is not admin/,
    );
  });

  // -------------------------------------------------------------------------
  // 3. Minted asset exists (ownerOf)
  // -------------------------------------------------------------------------
  it('ownerOf returns the recipient address after minting', async () => {
    const user1Addr = await user1.getAddress();
    const { tokenId } = await mintOne(contract, admin, user1Addr);
    const owner = await contract.ownerOf(tokenId);
    assert.equal(owner, user1Addr);
  });

  // -------------------------------------------------------------------------
  // 4. Asset is associated with the correct DID
  // -------------------------------------------------------------------------
  it('getAsset returns the correct DID after minting', async () => {
    const user1Addr = await user1.getAddress();
    const did = 'did:pehchan:wallet_didtest001';
    const { tokenId } = await mintOne(contract, admin, user1Addr, did);

    const asset = await contract.getAsset(tokenId);
    assert.equal(asset.did, did);
    assert.equal(asset.didHash, ethers.keccak256(ethers.toUtf8Bytes(did)));
  });

  // -------------------------------------------------------------------------
  // 5. Ownership can be queried via getAssetOwner
  // -------------------------------------------------------------------------
  it('getAssetOwner returns ownerAddress, did, didHash correctly', async () => {
    const user1Addr = await user1.getAddress();
    const did = 'did:pehchan:wallet_ownerquery';
    const { tokenId } = await mintOne(contract, admin, user1Addr, did);

    const [ownerAddress, returnedDid, returnedDidHash] = await contract.getAssetOwner(tokenId);
    assert.equal(ownerAddress, user1Addr);
    assert.equal(returnedDid, did);
    assert.equal(returnedDidHash, ethers.keccak256(ethers.toUtf8Bytes(did)));
  });

  // -------------------------------------------------------------------------
  // 6. getAssetsByDID returns correct token list
  // -------------------------------------------------------------------------
  it('getAssetsByDID returns all tokens associated with a given DID', async () => {
    // Deploy fresh to get clean gas estimates with no prior state
    const fresh = await deployFresh();
    const user1Addr = await fresh.user1.getAddress();
    const did = 'did:pehchan:wallet_multiasset';

    const { tokenId: t1 } = await mintOne(fresh.contract, fresh.admin, user1Addr, did);
    const { tokenId: t2 } = await mintOne(fresh.contract, fresh.admin, user1Addr, did);

    const tokens = await fresh.contract.getAssetsByDID(did);
    const tokenNumbers = tokens.map(BigInt);
    assert.ok(tokenNumbers.includes(t1), `expected tokenId ${t1} in list`);
    assert.ok(tokenNumbers.includes(t2), `expected tokenId ${t2} in list`);
  });

  // -------------------------------------------------------------------------
  // 7. Admin can assignAsset (transfer to new owner + new DID)
  // -------------------------------------------------------------------------
  it('admin can assignAsset — changes owner and DID binding', async () => {
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();
    const originalDid = 'did:pehchan:wallet_assign_src';
    const newDid = 'did:pehchan:wallet_assign_dst';

    const { tokenId } = await mintOne(contract, admin, user1Addr, originalDid);

    const tx = await contract.connect(admin).assignAsset(tokenId, user2Addr, newDid);
    await tx.wait();

    const newOwner = await contract.ownerOf(tokenId);
    assert.equal(newOwner, user2Addr);

    const asset = await contract.getAsset(tokenId);
    assert.equal(asset.did, newDid);
    assert.equal(asset.didHash, ethers.keccak256(ethers.toUtf8Bytes(newDid)));
  });

  // -------------------------------------------------------------------------
  // 8. Authorized manager can assignAsset
  // -------------------------------------------------------------------------
  it('authorized manager can assignAsset', async () => {
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();
    const managerAddr = await manager.getAddress();

    // Authorize manager
    const authTx = await contract.connect(admin).setManager(managerAddr, true);
    await authTx.wait();

    const did = 'did:pehchan:wallet_mgr_src';
    const { tokenId } = await mintOne(contract, admin, user1Addr, did);

    const assignTx = await contract.connect(manager).assignAsset(
      tokenId,
      user2Addr,
      'did:pehchan:wallet_mgr_dst',
    );
    await assignTx.wait();

    const newOwner = await contract.ownerOf(tokenId);
    assert.equal(newOwner, user2Addr);
  });

  // -------------------------------------------------------------------------
  // 9. Unauthorized caller cannot assignAsset
  // -------------------------------------------------------------------------
  it('stranger cannot assignAsset (reverts with access-control message)', async () => {
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();

    const { tokenId } = await mintOne(contract, admin, user1Addr);

    await assert.rejects(
      () => contract.connect(stranger).assignAsset(
        tokenId,
        user2Addr,
        'did:pehchan:wallet_bad_assign',
      ),
      /caller is not admin or manager/,
    );
  });

  // -------------------------------------------------------------------------
  // 10. Non-existent token assignAsset reverts
  // -------------------------------------------------------------------------
  it('assignAsset on a non-existent tokenId reverts', async () => {
    const user1Addr = await user1.getAddress();
    await assert.rejects(
      () => contract.connect(admin).assignAsset(
        999999n,
        user1Addr,
        'did:pehchan:wallet_ghost',
      ),
      /token does not exist/,
    );
  });

  // -------------------------------------------------------------------------
  // 11. AssetMinted event is emitted with correct args
  // -------------------------------------------------------------------------
  it('mintAsset emits AssetMinted event with correct indexed args', async () => {
    const user1Addr = await user1.getAddress();
    const did = 'did:pehchan:wallet_event_test';
    const { tokenId, parsed } = await mintOne(contract, admin, user1Addr, did);

    assert.equal(parsed.name, 'AssetMinted');
    assert.equal(parsed.args.tokenId, tokenId);
    assert.equal(parsed.args.did, did);
    assert.equal(parsed.args.recipient, user1Addr);
    assert.equal(parsed.args.assetName, 'Test Asset');
    assert.equal(parsed.args.assetType, 'CREDENTIAL');
    assert.equal(parsed.args.didHash, ethers.keccak256(ethers.toUtf8Bytes(did)));
  });

  // -------------------------------------------------------------------------
  // 12. AssetAssigned event is emitted with correct args
  // -------------------------------------------------------------------------
  it('assignAsset emits AssetAssigned event with correct args', async () => {
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();
    const fromDid = 'did:pehchan:wallet_from_evt';
    const toDid = 'did:pehchan:wallet_to_evt';

    const { tokenId } = await mintOne(contract, admin, user1Addr, fromDid);

    const tx = await contract.connect(admin).assignAsset(tokenId, user2Addr, toDid);
    const receipt = await tx.wait();

    const iface = contract.interface;
    let assignedEvent = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'AssetAssigned') {
          assignedEvent = parsed;
          break;
        }
      } catch { /* skip */ }
    }

    assert.ok(assignedEvent, 'AssetAssigned event not emitted');
    assert.equal(assignedEvent.args.tokenId, tokenId);
    assert.equal(assignedEvent.args.fromDIDHash, ethers.keccak256(ethers.toUtf8Bytes(fromDid)));
    assert.equal(assignedEvent.args.toDIDHash, ethers.keccak256(ethers.toUtf8Bytes(toDid)));
    assert.equal(assignedEvent.args.fromAddress, user1Addr);
    assert.equal(assignedEvent.args.toAddress, user2Addr);
  });

  // -------------------------------------------------------------------------
  // 13. DID index updated after assignment
  // -------------------------------------------------------------------------
  it('getAssetsByDID removes token from old DID and adds to new DID after assignment', async () => {
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();
    const fromDid = 'did:pehchan:wallet_idx_from';
    const toDid = 'did:pehchan:wallet_idx_to';

    const { tokenId } = await mintOne(contract, admin, user1Addr, fromDid);

    // Verify it's in fromDid list before assignment
    const beforeFrom = await contract.getAssetsByDID(fromDid);
    assert.ok(beforeFrom.map(BigInt).includes(tokenId));

    await (await contract.connect(admin).assignAsset(tokenId, user2Addr, toDid)).wait();

    const afterFrom = await contract.getAssetsByDID(fromDid);
    assert.ok(!afterFrom.map(BigInt).includes(tokenId), 'token should no longer be in old DID');

    const afterTo = await contract.getAssetsByDID(toDid);
    assert.ok(afterTo.map(BigInt).includes(tokenId), 'token should be in new DID list');
  });

  // -------------------------------------------------------------------------
  // 14. totalAssets() increments
  // -------------------------------------------------------------------------
  it('totalAssets() increments with each mint', async () => {
    // Deploy a fresh contract to get deterministic count
    const fresh = await deployFresh();
    const user1Addr = await fresh.user1.getAddress();

    const before = await fresh.contract.totalAssets();
    await mintOne(fresh.contract, fresh.admin, user1Addr);
    const after1 = await fresh.contract.totalAssets();
    await mintOne(fresh.contract, fresh.admin, user1Addr);
    const after2 = await fresh.contract.totalAssets();

    assert.equal(after1, before + 1n);
    assert.equal(after2, before + 2n);
  });

  // -------------------------------------------------------------------------
  // 15. Admin can authorize and revoke a manager
  // -------------------------------------------------------------------------
  it('setManager(true) authorizes a manager; setManager(false) revokes', async () => {
    const fresh = await deployFresh();
    const managerAddr = await fresh.manager.getAddress();

    assert.equal(await fresh.contract.isManager(managerAddr), false);

    await (await fresh.contract.connect(fresh.admin).setManager(managerAddr, true)).wait();
    assert.equal(await fresh.contract.isManager(managerAddr), true);

    await (await fresh.contract.connect(fresh.admin).setManager(managerAddr, false)).wait();
    assert.equal(await fresh.contract.isManager(managerAddr), false);
  });

  // -------------------------------------------------------------------------
  // 16. Revoked manager cannot assignAsset
  // -------------------------------------------------------------------------
  it('revoked manager loses assignAsset rights', async () => {
    const fresh = await deployFresh();
    const user1Addr = await fresh.user1.getAddress();
    const user2Addr = await fresh.user2.getAddress();
    const managerAddr = await fresh.manager.getAddress();

    // Authorize then immediately revoke
    await (await fresh.contract.connect(fresh.admin).setManager(managerAddr, true)).wait();
    await (await fresh.contract.connect(fresh.admin).setManager(managerAddr, false)).wait();

    const { tokenId } = await mintOne(fresh.contract, fresh.admin, user1Addr);

    await assert.rejects(
      () => fresh.contract.connect(fresh.manager).assignAsset(
        tokenId,
        user2Addr,
        'did:pehchan:wallet_revoked_mgr',
      ),
      /caller is not admin or manager/,
    );
  });

  // -------------------------------------------------------------------------
  // 17. Admin can transfer admin role
  // -------------------------------------------------------------------------
  it('transferAdmin transfers admin rights; old admin loses privileges', async () => {
    const fresh = await deployFresh();
    const newAdminAddr = await fresh.manager.getAddress();

    await (await fresh.contract.connect(fresh.admin).transferAdmin(newAdminAddr)).wait();
    assert.equal(await fresh.contract.admin(), newAdminAddr);

    // Old admin can no longer mint
    const user1Addr = await fresh.user1.getAddress();
    await assert.rejects(
      () => fresh.contract.connect(fresh.admin).mintAsset(
        user1Addr,
        'did:pehchan:wallet_old_admin',
        'Old Admin Asset',
        'CREDENTIAL',
        '',
        ethers.id('x'),
      ),
      /caller is not admin/,
    );
  });

  // -------------------------------------------------------------------------
  // 18. setCredentialRegistry updates the stored address
  // -------------------------------------------------------------------------
  it('setCredentialRegistry stores the new registry address', async () => {
    const fresh = await deployFresh();
    const fakeRegistry = await fresh.user1.getAddress();

    await (await fresh.contract.connect(fresh.admin).setCredentialRegistry(fakeRegistry)).wait();
    assert.equal(await fresh.contract.credentialRegistry(), fakeRegistry);
  });
});
