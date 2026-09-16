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

// In-memory mock store for offline testing
class MockRoleStore {
  constructor() {
    this.rolesMap = new Map(); // address => Set of role names ('ADMIN', 'MANAGER', 'AUDITOR', 'USER')
  }

  assignRole(targetDID, role) {
    const account = resolveAddressFromDID(targetDID);
    if (!this.rolesMap.has(account)) {
      this.rolesMap.set(account, new Set());
    }
    this.rolesMap.get(account).add(role);

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
  }
}

const mockRoleStore = new MockRoleStore();

/** Assign role to target DID */
async function assignRole({ targetDID, role }) {
  if (!isBlockchainEnabled()) {
    return mockRoleStore.assignRole(targetDID, role);
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
    throw error;
  }
}

/** Revoke role from target DID */
async function revokeRole({ targetDID, role }) {
  if (!isBlockchainEnabled()) {
    return mockRoleStore.revokeRole(targetDID, role);
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
    throw error;
  }
}

/** Query active roles for target DID from authoritative PehchanAccessControl contract */
async function getRolesForDID(targetDID) {
  if (!isBlockchainEnabled()) {
    return mockRoleStore.getRolesForDID(targetDID);
  }

  const account = resolveAddressFromDID(targetDID);
  const contract = await getAccessControlContract();

  const [isAdmin, isManager, isAuditor, isUser] = await Promise.all([
    contract.isAdmin(account).catch(() => false),
    contract.isManager(account).catch(() => false),
    contract.isAuditor(account).catch(() => false),
    contract.isUser(account).catch(() => false),
  ]);

  const roles = [];
  if (isAdmin) roles.push('ADMIN');
  if (isManager) roles.push('MANAGER');
  if (isAuditor) roles.push('AUDITOR');
  if (isUser) roles.push('USER');

  return {
    targetDID,
    account,
    roles,
    isAdmin,
    isManager,
    isAuditor,
    isUser,
  };
}

module.exports = {
  assignRole,
  revokeRole,
  getRolesForDID,
  resolveAddressFromDID,
  mockRoleStore,
};
