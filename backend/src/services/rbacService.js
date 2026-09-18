/**
 * rbacService.js
 *
 * Business logic service for PehchanChain smart-contract Role-Based Access Control (RBAC).
 * Queries and updates the authoritative PehchanAccessControl contract on Polygon Amoy.
 * Provides an in-memory fallback store when BLOCKCHAIN_ENABLED !== 'true'.
 */

'use strict';

const { ethers } = require('ethers');
const {
  isBlockchainEnabled,
  getAccessControlContract,
} = require('./blockchainAssetService');

const ROLE_HASHES = {
  ADMIN: ethers.keccak256(ethers.toUtf8Bytes('ADMIN_ROLE')),
  MANAGER: ethers.keccak256(ethers.toUtf8Bytes('MANAGER_ROLE')),
  AUDITOR: ethers.keccak256(ethers.toUtf8Bytes('AUDITOR_ROLE')),
  USER: ethers.keccak256(ethers.toUtf8Bytes('USER_ROLE')),
};

/** Resolves an Ethereum address from a DID string or address */
function resolveAddressFromDID(targetDID) {
  if (ethers.isAddress(targetDID)) {
    return targetDID;
  }
  // If targetDID is in format did:pehchan:0x1234...
  const matchAddr = /0x[a-fA-F0-9]{40}/.exec(targetDID);
  if (matchAddr) {
    return matchAddr[0];
  }

  // Deterministically derive a valid 20-byte address from the DID string for testing/mocking
  return ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(targetDID))).slice(0, 20).reduce(
    (acc, byte) => acc + byte.toString(16).padStart(2, '0'),
    '0x',
  );
}

const fs = require('fs');
const path = require('path');

const ROLES_FILE_PATH = path.resolve(__dirname, '../../data/roles.json');

// Persistent role store for offline / local mode
class MockRoleStore {
  constructor() {
    this.rolesMap = new Map(); // address => Set of role names ('ADMIN', 'MANAGER', 'AUDITOR', 'USER')
    this.loadFromDisk();
    this.seedDefaults();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(ROLES_FILE_PATH)) {
        const raw = fs.readFileSync(ROLES_FILE_PATH, 'utf8');
        const obj = JSON.parse(raw);
        for (const [account, rolesArray] of Object.entries(obj)) {
          this.rolesMap.set(account, new Set(rolesArray));
        }
      }
    } catch (err) {
      console.warn('[MockRoleStore] Error loading roles from disk:', err.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(ROLES_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = {};
      for (const [account, roleSet] of this.rolesMap.entries()) {
        obj[account] = Array.from(roleSet);
      }
      fs.writeFileSync(ROLES_FILE_PATH, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('[MockRoleStore] Error saving roles to disk:', err.message);
    }
  }

  seedDefaults() {
    const adminAcct = resolveAddressFromDID('did:pehchan:admin_workspace');
    if (!this.rolesMap.has(adminAcct)) {
      this.rolesMap.set(adminAcct, new Set(['ADMIN', 'MANAGER', 'AUDITOR', 'USER']));
    }
    const mgrAcct = resolveAddressFromDID('did:pehchan:manager_workspace');
    if (!this.rolesMap.has(mgrAcct)) {
      this.rolesMap.set(mgrAcct, new Set(['MANAGER', 'USER']));
    }
  }

  assignRole(targetDID, role) {
    const account = resolveAddressFromDID(targetDID);
    if (!this.rolesMap.has(account)) {
      this.rolesMap.set(account, new Set());
    }
    this.rolesMap.get(account).add(role);
    this.saveToDisk();

    return {
      targetDID,
      account,
      role,
      transactionHash: `0xmocktxgrantrole${role.toLowerCase()}${account.slice(2, 10)}`,
      blockNumber: 3001,
    };
  }

  revokeRole(targetDID, role) {
    const account = resolveAddressFromDID(targetDID);
    if (this.rolesMap.has(account)) {
      this.rolesMap.get(account).delete(role);
      this.saveToDisk();
    }

    return {
      targetDID,
      account,
      role,
      transactionHash: `0xmocktxrevokerole${role.toLowerCase()}${account.slice(2, 10)}`,
      blockNumber: 3002,
    };
  }

  getRolesForDID(targetDID) {
    const account = resolveAddressFromDID(targetDID);
    const roleSet = this.rolesMap.get(account) || new Set();
    const roles = Array.from(roleSet);

    return {
      targetDID,
      account,
      roles,
      isAdmin: roleSet.has('ADMIN'),
      isManager: roleSet.has('MANAGER'),
      isAuditor: roleSet.has('AUDITOR'),
      isUser: roleSet.has('USER'),
    };
  }

  reset() {
    this.rolesMap.clear();
    this.seedDefaults();
    this.saveToDisk();
  }
}

const mockRoleStore = new MockRoleStore();

/** Assign role to target DID */
async function assignRole({ targetDID, role }) {
  // Always record in local store so inspections are consistent
  const localResult = mockRoleStore.assignRole(targetDID, role);

  if (!isBlockchainEnabled()) {
    return localResult;
  }

  const account = resolveAddressFromDID(targetDID);
  const roleHash = ROLE_HASHES[role];

  try {
    const contract = await getAccessControlContract();
    const tx = await contract.grantRole(roleHash, account);
    const receipt = await tx.wait();

    return {
      targetDID,
      account,
      role,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (error.message && (error.message.includes('AccessControlUnauthorizedAccount') || error.message.includes('unknown custom error') || error.message.includes('CALL_EXCEPTION'))) {
      const err = new Error('Unauthorized: Admin role required for role management.');
      err.status = 403;
      throw err;
    }
    console.warn('[rbacService] On-chain grantRole failed, using local fallback:', error.message);
    return { ...localResult, offlineFallback: true };
  }
}

/** Revoke role from target DID */
async function revokeRole({ targetDID, role }) {
  // Always record in local store so inspections are consistent
  const localResult = mockRoleStore.revokeRole(targetDID, role);

  if (!isBlockchainEnabled()) {
    return localResult;
  }

  const account = resolveAddressFromDID(targetDID);
  const roleHash = ROLE_HASHES[role];

  try {
    const contract = await getAccessControlContract();
    const tx = await contract.revokeRole(roleHash, account);
    const receipt = await tx.wait();

    return {
      targetDID,
      account,
      role,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (error.message && (error.message.includes('AccessControlUnauthorizedAccount') || error.message.includes('unknown custom error') || error.message.includes('CALL_EXCEPTION'))) {
      const err = new Error('Unauthorized: Admin role required for role management.');
      err.status = 403;
      throw err;
    }
    console.warn('[rbacService] On-chain revokeRole failed, using local fallback:', error.message);
    return { ...localResult, offlineFallback: true };
  }
}

/** Query active roles for target DID — tries on-chain first, falls back to local store */
async function getRolesForDID(targetDID) {
  if (!isBlockchainEnabled()) {
    return mockRoleStore.getRolesForDID(targetDID);
  }

  const account = resolveAddressFromDID(targetDID);

  try {
    const contract = await getAccessControlContract();

    const [isAdmin, isManager, isAuditor, isUser] = await Promise.all([
      contract.isAdmin(account).catch(() => false),
      contract.isManager(account).catch(() => false),
      contract.isAuditor(account).catch(() => false),
      contract.isUser(account).catch(() => false),
    ]);

    const onChainRoles = [];
    if (isAdmin) onChainRoles.push('ADMIN');
    if (isManager) onChainRoles.push('MANAGER');
    if (isAuditor) onChainRoles.push('AUDITOR');
    if (isUser) onChainRoles.push('USER');

    // Merge on-chain roles with locally-assigned roles
    const localData = mockRoleStore.getRolesForDID(targetDID);
    const mergedRoles = [...new Set([...onChainRoles, ...localData.roles])];

    return {
      targetDID,
      account,
      roles: mergedRoles,
      isAdmin: isAdmin || localData.isAdmin,
      isManager: isManager || localData.isManager,
      isAuditor: isAuditor || localData.isAuditor,
      isUser: isUser || localData.isUser,
    };
  } catch (error) {
    console.warn('[rbacService] On-chain role query failed, using local store:', error.message);
    return mockRoleStore.getRolesForDID(targetDID);
  }
}

module.exports = {
  assignRole,
  revokeRole,
  getRolesForDID,
  resolveAddressFromDID,
  mockRoleStore,
};
