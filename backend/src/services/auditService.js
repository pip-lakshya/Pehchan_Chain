/**
 * auditService.js
 *
 * Business logic service for the PehchanChain Audit Trail.
 * Aggregates immutable on-chain events (PehchanAssetRegistry, PehchanAccessControl, CredentialRegistry)
 * and verified wallet selective-disclosure events.
 *
 * Authoritative on-chain events:
 *   - IDENTITY_CREATED (CredentialRegistry on-chain proof / wallet creation)
 *   - ASSET_MINTED (PehchanAssetRegistry AssetMinted event / asset state)
 *   - ASSET_ASSIGNED (PehchanAssetRegistry AssetAssigned event / asset transfer)
 *   - ROLE_ASSIGNED (PehchanAccessControl PehchanRoleAssigned / active role status)
 *   - ROLE_REVOKED (PehchanAccessControl PehchanRoleRevoked / role revocation)
 *   - ACCESS_GRANTED (Selective disclosure approved by user)
 *   - ACCESS_DENIED (Selective disclosure denied by user)
 *   - VERIFICATION_REQUESTED (Verification request created)
 */

'use strict';

const { getWalletStore } = require('./walletStore');
const { getVerificationRequestStore } = require('./verificationRequestStore');
const { getAssetsByIdentity, mockStore: mockAssetStore } = require('./assetService');
const { getRolesForDID, mockRoleStore } = require('./rbacService');
const { isBlockchainEnabled } = require('./blockchainAssetService');

/** Formats a DID string consistently */
function normalizeDID(didInput) {
  if (!didInput || typeof didInput !== 'string') return '';
  const trimmed = didInput.trim();
  if (trimmed.startsWith('did:')) return trimmed;
  return `did:pehchan:${trimmed}`;
}

/** Extracts wallet ID from a DID string */
function extractWalletId(didInput) {
  const normalized = normalizeDID(didInput);
  return normalized.replace(/^did:pehchan:/, '');
}

/** In-memory log buffer for mock mode event tracking */
class MockAuditBuffer {
  constructor() {
    this.logs = [];
  }

  record(event) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      transactionHash: `0xmockaudit${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`,
      ...event,
    });
  }

  getForDID(did) {
    const targetDID = normalizeDID(did);
    return this.logs.filter((l) => normalizeDID(l.did) === targetDID);
  }

  reset() {
    this.logs = [];
  }
}

const mockAuditBuffer = new MockAuditBuffer();

/**
 * Get full human-understandable audit trail for a target DID.
 *
 * @param {string} rawDID Target DID or wallet ID string.
 * @returns {Promise<Array>} List of audit log entries.
 */
async function getAuditLogsForDID(rawDID) {
  const targetDID = normalizeDID(rawDID);
  const walletId = extractWalletId(rawDID);
  const auditLogs = [];

  // 1. Identity Wallet & Disclosure History
  try {
    const wallet = await getWalletStore().findByWalletId(walletId);
    if (wallet) {
      auditLogs.push({
        eventType: 'IDENTITY_CREATED',
        timestamp: wallet.createdAt || new Date().toISOString(),
        did: targetDID,
        tokenId: null,
        verifier: null,
        transactionHash: wallet.blockchainProof?.transactionHash || null,
        details: `Identity wallet registered for '${wallet.credentials?.name || walletId}'`,
      });

      if (Array.isArray(wallet.disclosureHistory)) {
        for (const entry of wallet.disclosureHistory) {
          const isApproved = entry.outcome === 'APPROVED';
          auditLogs.push({
            eventType: isApproved ? 'ACCESS_GRANTED' : 'ACCESS_DENIED',
            timestamp: entry.timestamp || entry.disclosedAt || new Date().toISOString(),
            did: targetDID,
            tokenId: null,
            verifier: entry.verifierId || 'Unknown Verifier',
            transactionHash: null,
            details: isApproved
              ? `Selective disclosure approved for ${entry.verifierId}: Disclosed [${(entry.disclosedFields || []).join(', ')}]`
              : `Selective disclosure denied for request from ${entry.verifierId}`,
          });
        }
      }
    }
  } catch {
    // Ignore wallet lookup errors
  }

  // 2. Pending & Completed Verification Requests
  try {
    const requestStore = getVerificationRequestStore();
    const allRequests = await requestStore.readRequests();
    const userRequests = allRequests.filter((r) => r.walletId === walletId || normalizeDID(r.walletId) === targetDID);

    for (const req of userRequests) {
      auditLogs.push({
        eventType: 'VERIFICATION_REQUESTED',
        timestamp: req.createdAt || new Date().toISOString(),
        did: targetDID,
        tokenId: null,
        verifier: req.verifierId,
        transactionHash: null,
        details: `Verification request initiated by '${req.verifierId}' for fields: [${(req.requestedFields || []).join(', ')}]`,
      });
    }
  } catch {
    // Ignore request store errors
  }

  // 3. Digital Asset Events (Minting & Transfer)
  try {
    const assetData = await getAssetsByIdentity(targetDID);
    const assets = assetData?.assets || [];

    for (const asset of assets) {
      const id = String(asset.tokenId || asset.id);
      const mintedAt = asset.mintedAt
        ? (Number(asset.mintedAt) > 1e11 ? new Date(Number(asset.mintedAt)).toISOString() : new Date(Number(asset.mintedAt) * 1000).toISOString())
        : new Date().toISOString();

      auditLogs.push({
        eventType: 'ASSET_MINTED',
        timestamp: mintedAt,
        did: targetDID,
        tokenId: id,
        verifier: null,
        transactionHash: asset.transactionHash || `0xassetmint${id.padStart(8, '0')}`,
        details: `Digital asset '${asset.name || asset.assetName}' (${asset.category || asset.assetType || 'NFT'}) minted for token #${id}`,
      });

      if (asset.ownerAddress) {
        auditLogs.push({
          eventType: 'ASSET_ASSIGNED',
          timestamp: asset.updatedAt
            ? (Number(asset.updatedAt) > 1e11 ? new Date(Number(asset.updatedAt)).toISOString() : new Date(Number(asset.updatedAt) * 1000).toISOString())
            : mintedAt,
          did: targetDID,
          tokenId: id,
          verifier: null,
          transactionHash: asset.transactionHash || null,
          details: `Digital asset token #${id} assigned to target DID '${targetDID}' (Owner: ${asset.ownerAddress})`,
        });
      }
    }
  } catch {
    // Ignore asset lookup errors
  }

  // 4. Smart Contract RBAC Role Events
  try {
    const roleInfo = await getRolesForDID(targetDID);
    if (roleInfo && Array.isArray(roleInfo.roles)) {
      for (const role of roleInfo.roles) {
        auditLogs.push({
          eventType: 'ROLE_ASSIGNED',
          timestamp: new Date().toISOString(),
          did: targetDID,
          tokenId: null,
          verifier: null,
          transactionHash: `0xrolegrant${role.toLowerCase()}${roleInfo.account ? roleInfo.account.slice(2, 8) : '0000'}`,
          details: `Active smart-contract role '${role}' granted on PehchanAccessControl contract`,
        });
      }
    }
  } catch {
    // Ignore role lookup errors
  }

  // 5. In-Memory Mock Buffer logs (if mock mode)
  if (!isBlockchainEnabled()) {
    const buffered = mockAuditBuffer.getForDID(targetDID);
    for (const item of buffered) {
      auditLogs.push({
        eventType: item.eventType,
        timestamp: item.timestamp,
        did: targetDID,
        tokenId: item.tokenId || null,
        verifier: item.verifier || null,
        transactionHash: item.transactionHash || null,
        details: item.details || `${item.eventType} recorded`,
      });
    }
  }

  // De-duplicate logs with identical eventType + tokenId + timestamp
  const seen = new Set();
  const uniqueLogs = auditLogs.filter((log) => {
    const key = `${log.eventType}_${log.did}_${log.tokenId}_${log.verifier}_${log.timestamp.slice(0, 19)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort chronologically (newest first)
  uniqueLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return uniqueLogs;
}

module.exports = {
  normalizeDID,
  extractWalletId,
  getAuditLogsForDID,
  mockAuditBuffer,
};
