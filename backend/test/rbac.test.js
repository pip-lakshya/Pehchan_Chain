/**
 * PehchanChain RBAC — Hardhat in-process tests
 *
 * Uses node:test + Hardhat's in-memory EVM + ethers.js v6.
 * No live network required. Tests run offline.
 *
 * Coverage:
 *   PehchanAccessControl (hub):
 *     1.  Deployer receives DEFAULT_ADMIN_ROLE
 *     2.  DEFAULT_ADMIN can grant ADMIN_ROLE
 *     3.  ADMIN can grant MANAGER_ROLE
 *     4.  ADMIN can grant AUDITOR_ROLE
 *     5.  ADMIN can grant USER_ROLE
 *     6.  ADMIN can revoke MANAGER_ROLE
 *     7.  ADMIN can revoke AUDITOR_ROLE
 *     8.  ADMIN can revoke USER_ROLE
 *     9.  MANAGER cannot grant any role
 *    10.  USER cannot grant any role
 *    11.  AUDITOR cannot grant any role
 *    12.  Stranger (no role) cannot grant any role
 *    13.  RoleGranted + PehchanRoleAssigned events emitted on grant
 *    14.  RoleRevoked + PehchanRoleRevoked events emitted on revoke
 *    15.  Convenience views (isAdmin, isManager, isAuditor, isUser)
 *
 *   PehchanAssetRegistry (integration):
 *    16.  ADMIN_ROLE holder can mintAsset
 *    17.  MANAGER_ROLE holder cannot mintAsset (reverts)
 *    18.  USER_ROLE holder cannot mintAsset (reverts)
 *    19.  Stranger cannot mintAsset (reverts)
 *    20.  ADMIN_ROLE holder can assignAsset
 *    21.  MANAGER_ROLE holder can assignAsset
 *    22.  USER_ROLE holder cannot assignAsset (reverts)
 *    23.  Stranger cannot assignAsset (reverts)
 *    24.  Revoked MANAGER loses assignAsset rights
 *
 *   CredentialRegistry (integration):
 *    25.  USER_ROLE holder can registerCredential
 *    26.  Stranger cannot registerCredential (reverts)
 *    27.  AUDITOR_ROLE holder can verifyCredential
 *    28.  Stranger cannot verifyCredential (reverts)
 *    29.  ADMIN_ROLE holder can revokeCredential for any user
 *    30.  USER_ROLE holder can revoke their own credential
 *    31.  USER_ROLE holder cannot revoke another user's credential
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('assert/strict');
const { ethers } = require('ethers');
const hre = require('hardhat');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deploy the full PehchanChain contract stack:
 *   1. PehchanAccessControl (hub)
 *   2. PehchanAssetRegistry (ERC-721)
 *   3. CredentialRegistry
 *
 * The deployer (signer 0) receives DEFAULT_ADMIN_ROLE.
 * ADMIN_ROLE is granted to the admin signer (signer 0) so it can operate.
 */
async function deployStack() {
  const provider = new ethers.BrowserProvider(hre.network.provider);

  const deployer = await provider.getSigner(0);
  const adminSigner = await provider.getSigner(1);
  const managerSigner = await provider.getSigner(2);
  const auditorSigner = await provider.getSigner(3);
  const userSigner = await provider.getSigner(4);
  const user2Signer = await provider.getSigner(5);
  const stranger = await provider.getSigner(6);

  // --- Deploy PehchanAccessControl ---
  const acArtifact = await hre.artifacts.readArtifact('PehchanAccessControl');
  const acFactory = new ethers.ContractFactory(acArtifact.abi, acArtifact.bytecode, deployer);
  const ac = await acFactory.deploy(await deployer.getAddress());
  await ac.waitForDeployment();

  // Grant ADMIN_ROLE to adminSigner
  const ADMIN_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE'));
  await (await ac.connect(deployer).grantRole(ADMIN_ROLE, await adminSigner.getAddress())).wait();

  // --- Deploy PehchanAssetRegistry ---
  const arArtifact = await hre.artifacts.readArtifact('PehchanAssetRegistry');
  const arFactory = new ethers.ContractFactory(arArtifact.abi, arArtifact.bytecode, deployer);
  const ar = await arFactory.deploy(
    'PehchanAsset',
    'PCNA',
    await ac.getAddress(),
    ethers.ZeroAddress,
  );
  await ar.waitForDeployment();

  // --- Deploy CredentialRegistry ---
  const crArtifact = await hre.artifacts.readArtifact('CredentialRegistry');
  const crFactory = new ethers.ContractFactory(crArtifact.abi, crArtifact.bytecode, deployer);
  const cr = await crFactory.deploy(await ac.getAddress());
  await cr.waitForDeployment();

  // Pre-compute role hashes for convenience
  const MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MANAGER_ROLE'));
  const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('AUDITOR_ROLE'));
  const USER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('USER_ROLE'));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  return {
    provider,
    ac, ar, cr,
    deployer, adminSigner, managerSigner, auditorSigner, userSigner, user2Signer, stranger,
    ADMIN_ROLE, MANAGER_ROLE, AUDITOR_ROLE, USER_ROLE, DEFAULT_ADMIN_ROLE,
  };
}

/** Mint one asset via PehchanAssetRegistry, return tokenId */
async function mintOne(ar, signer, recipient, did = 'did:pehchan:wallet_rbac_test') {
  const tx = await ar.connect(signer).mintAsset(
    recipient,
    did,
    'RBAC Test Asset',
    'CREDENTIAL',
    'ipfs://QmRbacTest',
    ethers.id('rbac-data'),
  );
  const receipt = await tx.wait();
  const iface = ar.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'AssetMinted') {
        return parsed.args.tokenId;
      }
    } catch { /* skip */ }
  }
  throw new Error('AssetMinted event not found');
}

// ---------------------------------------------------------------------------
// Test suite — PehchanAccessControl (hub)
// ---------------------------------------------------------------------------

describe('PehchanAccessControl', () => {
  let ac;
  let deployer;
  let adminSigner;
  let managerSigner;
  let auditorSigner;
  let userSigner;
  let stranger;
  let ADMIN_ROLE;
  let MANAGER_ROLE;
  let AUDITOR_ROLE;
  let USER_ROLE;
  let DEFAULT_ADMIN_ROLE;

  before(async () => {
    ({
      ac, deployer, adminSigner, managerSigner, auditorSigner,
      userSigner, stranger,
      ADMIN_ROLE, MANAGER_ROLE, AUDITOR_ROLE, USER_ROLE, DEFAULT_ADMIN_ROLE,
    } = await deployStack());
  });

  // 1
  it('deployer receives DEFAULT_ADMIN_ROLE', async () => {
    assert.equal(
      await ac.hasRole(DEFAULT_ADMIN_ROLE, await deployer.getAddress()),
      true,
    );
  });

  // 2
  it('DEFAULT_ADMIN can grant ADMIN_ROLE', async () => {
    // Already granted in deployStack — verify
    assert.equal(
      await ac.hasRole(ADMIN_ROLE, await adminSigner.getAddress()),
      true,
    );
  });

  // 3
  it('ADMIN can grant MANAGER_ROLE', async () => {
    const addr = await managerSigner.getAddress();
    await (await ac.connect(adminSigner).grantRole(MANAGER_ROLE, addr)).wait();
    assert.equal(await ac.hasRole(MANAGER_ROLE, addr), true);
  });

  // 4
  it('ADMIN can grant AUDITOR_ROLE', async () => {
    const addr = await auditorSigner.getAddress();
    await (await ac.connect(adminSigner).grantRole(AUDITOR_ROLE, addr)).wait();
    assert.equal(await ac.hasRole(AUDITOR_ROLE, addr), true);
  });

  // 5
  it('ADMIN can grant USER_ROLE', async () => {
    const addr = await userSigner.getAddress();
    await (await ac.connect(adminSigner).grantRole(USER_ROLE, addr)).wait();
    assert.equal(await ac.hasRole(USER_ROLE, addr), true);
  });

  // 6
  it('ADMIN can revoke MANAGER_ROLE', async () => {
    const stack = await deployStack();
    const addr = await stack.managerSigner.getAddress();
    await (await stack.ac.connect(stack.adminSigner).grantRole(stack.MANAGER_ROLE, addr)).wait();
    assert.equal(await stack.ac.hasRole(stack.MANAGER_ROLE, addr), true);

    await (await stack.ac.connect(stack.adminSigner).revokeRole(stack.MANAGER_ROLE, addr)).wait();
    assert.equal(await stack.ac.hasRole(stack.MANAGER_ROLE, addr), false);
  });

  // 7
  it('ADMIN can revoke AUDITOR_ROLE', async () => {
    const stack = await deployStack();
    const addr = await stack.auditorSigner.getAddress();
    await (await stack.ac.connect(stack.adminSigner).grantRole(stack.AUDITOR_ROLE, addr)).wait();
    await (await stack.ac.connect(stack.adminSigner).revokeRole(stack.AUDITOR_ROLE, addr)).wait();
    assert.equal(await stack.ac.hasRole(stack.AUDITOR_ROLE, addr), false);
  });

  // 8
  it('ADMIN can revoke USER_ROLE', async () => {
    const stack = await deployStack();
    const addr = await stack.userSigner.getAddress();
    await (await stack.ac.connect(stack.adminSigner).grantRole(stack.USER_ROLE, addr)).wait();
    await (await stack.ac.connect(stack.adminSigner).revokeRole(stack.USER_ROLE, addr)).wait();
    assert.equal(await stack.ac.hasRole(stack.USER_ROLE, addr), false);
  });

  // 9
  it('MANAGER cannot grant any role (reverts)', async () => {
    const addr = await stranger.getAddress();
    await assert.rejects(
      () => ac.connect(managerSigner).grantRole(USER_ROLE, addr),
      /unknown custom error|CALL_EXCEPTION|0xe2517d3f|AccessControlUnauthorizedAccount/,
    );
  });

  // 10
  it('USER cannot grant any role (reverts)', async () => {
    const addr = await stranger.getAddress();
    await assert.rejects(
      () => ac.connect(userSigner).grantRole(MANAGER_ROLE, addr),
      /unknown custom error|CALL_EXCEPTION|0xe2517d3f|AccessControlUnauthorizedAccount/,
    );
  });

  // 11
  it('AUDITOR cannot grant any role (reverts)', async () => {
    const addr = await stranger.getAddress();
    await assert.rejects(
      () => ac.connect(auditorSigner).grantRole(USER_ROLE, addr),
      /unknown custom error|CALL_EXCEPTION|0xe2517d3f|AccessControlUnauthorizedAccount/,
    );
  });

  // 12
  it('stranger (no role) cannot grant any role (reverts)', async () => {
    const addr = await userSigner.getAddress();
    await assert.rejects(
      () => ac.connect(stranger).grantRole(USER_ROLE, addr),
      /unknown custom error|CALL_EXCEPTION|0xe2517d3f|AccessControlUnauthorizedAccount/,
    );
  });

  // 13
  it('grantRole emits RoleGranted and PehchanRoleAssigned events', async () => {
    const stack = await deployStack();
    const addr = await stack.managerSigner.getAddress();
    const tx = await stack.ac.connect(stack.adminSigner).grantRole(stack.MANAGER_ROLE, addr);
    const receipt = await tx.wait();

    const iface = stack.ac.interface;
    const eventNames = [];
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed) eventNames.push(parsed.name);
      } catch { /* skip */ }
    }

    assert.ok(eventNames.includes('RoleGranted'), 'RoleGranted not emitted');
    assert.ok(eventNames.includes('PehchanRoleAssigned'), 'PehchanRoleAssigned not emitted');
  });

  // 14
  it('revokeRole emits RoleRevoked and PehchanRoleRevoked events', async () => {
    const stack = await deployStack();
    const addr = await stack.managerSigner.getAddress();
    await (await stack.ac.connect(stack.adminSigner).grantRole(stack.MANAGER_ROLE, addr)).wait();

    const tx = await stack.ac.connect(stack.adminSigner).revokeRole(stack.MANAGER_ROLE, addr);
    const receipt = await tx.wait();

    const iface = stack.ac.interface;
    const eventNames = [];
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed) eventNames.push(parsed.name);
      } catch { /* skip */ }
    }

    assert.ok(eventNames.includes('RoleRevoked'), 'RoleRevoked not emitted');
    assert.ok(eventNames.includes('PehchanRoleRevoked'), 'PehchanRoleRevoked not emitted');
  });

  // 15
  it('convenience views (isAdmin, isManager, isAuditor, isUser) return correct values', async () => {
    const adminAddr = await adminSigner.getAddress();
    const managerAddr = await managerSigner.getAddress();
    const auditorAddr = await auditorSigner.getAddress();
    const userAddr = await userSigner.getAddress();
    const strangerAddr = await stranger.getAddress();

    assert.equal(await ac.isAdmin(adminAddr), true);
    assert.equal(await ac.isManager(managerAddr), true);
    assert.equal(await ac.isAuditor(auditorAddr), true);
    assert.equal(await ac.isUser(userAddr), true);

    assert.equal(await ac.isAdmin(strangerAddr), false);
    assert.equal(await ac.isManager(strangerAddr), false);
    assert.equal(await ac.isAuditor(strangerAddr), false);
    assert.equal(await ac.isUser(strangerAddr), false);
  });
});

// ---------------------------------------------------------------------------
// Test suite — PehchanAssetRegistry RBAC integration
// ---------------------------------------------------------------------------

describe('PehchanAssetRegistry RBAC', () => {
  let ar;
  let ac;
  let adminSigner;
  let managerSigner;
  let userSigner;
  let stranger;
  let MANAGER_ROLE;
  let USER_ROLE;

  before(async () => {
    const stack = await deployStack();
    ar = stack.ar;
    ac = stack.ac;
    adminSigner = stack.adminSigner;
    managerSigner = stack.managerSigner;
    userSigner = stack.userSigner;
    stranger = stack.stranger;
    MANAGER_ROLE = stack.MANAGER_ROLE;
    USER_ROLE = stack.USER_ROLE;

    // Grant MANAGER and USER roles for these tests
    const managerAddr = await managerSigner.getAddress();
    const userAddr = await userSigner.getAddress();
    await (await ac.connect(adminSigner).grantRole(MANAGER_ROLE, managerAddr)).wait();
    await (await ac.connect(adminSigner).grantRole(USER_ROLE, userAddr)).wait();
  });

  // 16
  it('ADMIN_ROLE holder can mintAsset', async () => {
    const recipient = await userSigner.getAddress();
    const tokenId = await mintOne(ar, adminSigner, recipient);
    assert.ok(tokenId >= 1n);
  });

  // 17
  it('MANAGER_ROLE holder cannot mintAsset (reverts)', async () => {
    const recipient = await userSigner.getAddress();
    await assert.rejects(
      () => ar.connect(managerSigner).mintAsset(
        recipient, 'did:pehchan:wallet_mgr_mint', 'Bad', 'CREDENTIAL', '', ethers.id('x'),
      ),
      /caller is not admin/,
    );
  });

  // 18
  it('USER_ROLE holder cannot mintAsset (reverts)', async () => {
    const recipient = await userSigner.getAddress();
    await assert.rejects(
      () => ar.connect(userSigner).mintAsset(
        recipient, 'did:pehchan:wallet_user_mint', 'Bad', 'CREDENTIAL', '', ethers.id('x'),
      ),
      /caller is not admin/,
    );
  });

  // 19
  it('stranger cannot mintAsset (reverts)', async () => {
    const recipient = await userSigner.getAddress();
    await assert.rejects(
      () => ar.connect(stranger).mintAsset(
        recipient, 'did:pehchan:wallet_stranger_mint', 'Bad', 'CREDENTIAL', '', ethers.id('x'),
      ),
      /caller is not admin/,
    );
  });

  // 20
  it('ADMIN_ROLE holder can assignAsset', async () => {
    const user1Addr = await userSigner.getAddress();
    const user2Addr = await managerSigner.getAddress();
    const tokenId = await mintOne(ar, adminSigner, user1Addr, 'did:pehchan:wallet_admin_assign');

    const tx = await ar.connect(adminSigner).assignAsset(tokenId, user2Addr, 'did:pehchan:wallet_admin_assign_dst');
    await tx.wait();
    assert.equal(await ar.ownerOf(tokenId), user2Addr);
  });

  // 21
  it('MANAGER_ROLE holder can assignAsset', async () => {
    const user1Addr = await userSigner.getAddress();
    const user2Addr = await stranger.getAddress();
    const tokenId = await mintOne(ar, adminSigner, user1Addr, 'did:pehchan:wallet_mgr_assign');

    const tx = await ar.connect(managerSigner).assignAsset(tokenId, user2Addr, 'did:pehchan:wallet_mgr_assign_dst');
    await tx.wait();
    assert.equal(await ar.ownerOf(tokenId), user2Addr);
  });

  // 22
  it('USER_ROLE holder cannot assignAsset (reverts)', async () => {
    const user1Addr = await userSigner.getAddress();
    const user2Addr = await stranger.getAddress();
    const tokenId = await mintOne(ar, adminSigner, user1Addr, 'did:pehchan:wallet_user_assign');

    await assert.rejects(
      () => ar.connect(userSigner).assignAsset(tokenId, user2Addr, 'did:pehchan:wallet_user_assign_dst'),
      /caller is not admin or manager/,
    );
  });

  // 23
  it('stranger cannot assignAsset (reverts)', async () => {
    const user1Addr = await userSigner.getAddress();
    const user2Addr = await managerSigner.getAddress();
    const tokenId = await mintOne(ar, adminSigner, user1Addr, 'did:pehchan:wallet_stranger_assign');

    await assert.rejects(
      () => ar.connect(stranger).assignAsset(tokenId, user2Addr, 'did:pehchan:wallet_stranger_assign_dst'),
      /caller is not admin or manager/,
    );
  });

  // 24
  it('revoked MANAGER loses assignAsset rights', async () => {
    const stack = await deployStack();
    const managerAddr = await stack.managerSigner.getAddress();
    const userAddr = await stack.userSigner.getAddress();
    const user2Addr = await stack.user2Signer.getAddress();

    // Grant then revoke
    await (await stack.ac.connect(stack.adminSigner).grantRole(stack.MANAGER_ROLE, managerAddr)).wait();
    const tokenId = await mintOne(stack.ar, stack.adminSigner, userAddr, 'did:pehchan:wallet_revoke_mgr');
    await (await stack.ac.connect(stack.adminSigner).revokeRole(stack.MANAGER_ROLE, managerAddr)).wait();

    await assert.rejects(
      () => stack.ar.connect(stack.managerSigner).assignAsset(tokenId, user2Addr, 'did:pehchan:wallet_revoke_dst'),
      /caller is not admin or manager/,
    );
  });
});

// ---------------------------------------------------------------------------
// Test suite — CredentialRegistry RBAC integration
// ---------------------------------------------------------------------------

describe('CredentialRegistry RBAC', () => {
  let cr;
  let ac;
  let adminSigner;
  let auditorSigner;
  let userSigner;
  let user2Signer;
  let stranger;
  let USER_ROLE;
  let AUDITOR_ROLE;

  before(async () => {
    const stack = await deployStack();
    cr = stack.cr;
    ac = stack.ac;
    adminSigner = stack.adminSigner;
    auditorSigner = stack.auditorSigner;
    userSigner = stack.userSigner;
    user2Signer = stack.user2Signer;
    stranger = stack.stranger;
    USER_ROLE = stack.USER_ROLE;
    AUDITOR_ROLE = stack.AUDITOR_ROLE;

    // Grant USER_ROLE to userSigner and user2Signer, AUDITOR_ROLE to auditorSigner
    await (await ac.connect(adminSigner).grantRole(USER_ROLE, await userSigner.getAddress())).wait();
    await (await ac.connect(adminSigner).grantRole(USER_ROLE, await user2Signer.getAddress())).wait();
    await (await ac.connect(adminSigner).grantRole(AUDITOR_ROLE, await auditorSigner.getAddress())).wait();
  });

  // 25
  it('USER_ROLE holder can registerCredential', async () => {
    const hash = ethers.id('credential-rbac-25');
    const tx = await cr.connect(userSigner).registerCredential(hash);
    const receipt = await tx.wait();

    assert.ok(await cr.isCredentialRegistered(hash));

    // Verify event
    const iface = cr.interface;
    let registered = false;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'CredentialRegistered') {
          registered = true;
          assert.equal(parsed.args.walletAddress, await userSigner.getAddress());
        }
      } catch { /* skip */ }
    }
    assert.ok(registered, 'CredentialRegistered event not emitted');
  });

  // 26
  it('stranger cannot registerCredential (reverts)', async () => {
    const hash = ethers.id('credential-rbac-26');
    await assert.rejects(
      () => cr.connect(stranger).registerCredential(hash),
      /caller does not have USER_ROLE/,
    );
  });

  // 27
  it('AUDITOR_ROLE holder can verifyCredential', async () => {
    const hash = ethers.id('credential-rbac-27');
    await (await cr.connect(userSigner).registerCredential(hash)).wait();

    const tx = await cr.connect(auditorSigner).verifyCredential(hash);
    const receipt = await tx.wait();

    // Verify CredentialVerified event
    const iface = cr.interface;
    let verified = false;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'CredentialVerified') {
          verified = true;
          assert.equal(parsed.args.verifiedBy, await auditorSigner.getAddress());
        }
      } catch { /* skip */ }
    }
    assert.ok(verified, 'CredentialVerified event not emitted');
  });

  // 28
  it('stranger cannot verifyCredential (reverts)', async () => {
    const hash = ethers.id('credential-rbac-28');
    await (await cr.connect(userSigner).registerCredential(hash)).wait();

    await assert.rejects(
      () => cr.connect(stranger).verifyCredential(hash),
      /caller does not have AUDITOR_ROLE/,
    );
  });

  // 29
  it('ADMIN_ROLE holder can revokeCredential for any user', async () => {
    const hash = ethers.id('credential-rbac-29');
    await (await cr.connect(userSigner).registerCredential(hash)).wait();

    const tx = await cr.connect(adminSigner).revokeCredential(hash);
    const receipt = await tx.wait();

    const cred = await cr.getCredential(hash);
    assert.equal(cred.revoked, true);

    // Verify event
    const iface = cr.interface;
    let revoked = false;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'CredentialRevoked') {
          revoked = true;
          assert.equal(parsed.args.revokedBy, await adminSigner.getAddress());
        }
      } catch { /* skip */ }
    }
    assert.ok(revoked, 'CredentialRevoked event not emitted');
  });

  // 30
  it('USER_ROLE holder can revoke their own credential', async () => {
    const hash = ethers.id('credential-rbac-30');
    await (await cr.connect(userSigner).registerCredential(hash)).wait();

    await (await cr.connect(userSigner).revokeCredential(hash)).wait();

    const cred = await cr.getCredential(hash);
    assert.equal(cred.revoked, true);
  });

  // 31
  it('USER_ROLE holder cannot revoke another user\'s credential', async () => {
    const hash = ethers.id('credential-rbac-31');
    // user2 registers the credential
    await (await cr.connect(user2Signer).registerCredential(hash)).wait();

    // userSigner tries to revoke user2's credential — should fail
    await assert.rejects(
      () => cr.connect(userSigner).revokeCredential(hash),
      /caller cannot revoke this credential/,
    );
  });
});
