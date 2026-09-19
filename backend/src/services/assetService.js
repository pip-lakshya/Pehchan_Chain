/**
 * assetService.js
 *
 * Business logic service for PehchanChain digital assets.
 * Integrates with Polygon Amoy via blockchainAssetService when BLOCKCHAIN_ENABLED=true.
 * Provides an in-memory fallback store when blockchain integration is disabled.
 */

'use strict';

const {
  isBlockchainEnabled,
  mintAssetOnChain,
  assignAssetOnChain,
  getAssetOnChain,
  getAssetOwnerOnChain,
  getAssetsByDIDOnChain,
} = require('./blockchainAssetService');

// In-memory mock store for offline testing
class MockAssetStore {
  constructor() {
    this.assets = new Map(); // tokenId string => asset object
    this.didToTokens = new Map(); // targetDID => Set of tokenId strings
    this.nextTokenId = 1n;
  }

  mint({ recipient, targetDID, name, category, ipfsHash, payloadHash }) {
    const tokenId = (this.nextTokenId++).toString();
    const now = Math.floor(Date.now() / 1000).toString();

    const asset = {
      tokenId,
      ownerAddress: recipient,
      targetDID,
      name,
      category,
      ipfsHash: ipfsHash || '',
      payloadHash: payloadHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
      mintedAt: now,
      updatedAt: now,
    };

    this.assets.set(tokenId, asset);

    if (!this.didToTokens.has(targetDID)) {
      this.didToTokens.set(targetDID, new Set());
    }
    this.didToTokens.get(targetDID).add(tokenId);

    return {
      tokenId,
      recipient,
      targetDID,
      transactionHash: `0xmocktxmint${tokenId.padStart(56, '0')}`,
      blockNumber: 1000 + Number(tokenId),
    };
  }

  transfer({ tokenId, recipient, targetDID }) {
    const id = String(tokenId);
    const asset = this.assets.get(id);
    if (!asset) {
      const err = new Error('Asset does not exist.');
      err.status = 404;
      throw err;
    }

    // Remove from old DID set
    if (this.didToTokens.has(asset.targetDID)) {
      this.didToTokens.get(asset.targetDID).delete(id);
    }

    // Update asset
    asset.ownerAddress = recipient;
    asset.targetDID = targetDID;
    asset.updatedAt = Math.floor(Date.now() / 1000).toString();

    // Add to new DID set
    if (!this.didToTokens.has(targetDID)) {
      this.didToTokens.set(targetDID, new Set());
    }
    this.didToTokens.get(targetDID).add(id);

    return {
      tokenId: id,
      newOwner: recipient,
      targetDID,
      transactionHash: `0xmocktxtransfer${id.padStart(52, '0')}`,
      blockNumber: 2000 + Number(id),
    };
  }

  getOwner(tokenId) {
    const id = String(tokenId);
    const asset = this.assets.get(id);
    if (!asset) {
      const err = new Error('Asset not found.');
      err.status = 404;
      throw err;
    }
    return {
      tokenId: id,
      ownerAddress: asset.ownerAddress,
      targetDID: asset.targetDID,
    };
  }

  getByDID(targetDID) {
    const tokenSet = this.didToTokens.get(targetDID);
    if (!tokenSet || tokenSet.size === 0) {
      return { targetDID, tokenIds: [], assets: [] };
    }
    const tokenIds = Array.from(tokenSet);
    const assets = tokenIds.map((id) => this.assets.get(id));
    return { targetDID, tokenIds, assets };
  }

  reset() {
    this.assets.clear();
    this.didToTokens.clear();
    this.nextTokenId = 1n;
  }
}

const mockStore = new MockAssetStore();

const { getRolesForDID } = require('./rbacService');

/** Mint digital asset */
async function mintAsset(payload) {
  if (payload.requesterDID) {
    const userRoles = await getRolesForDID(payload.requesterDID);
    if (!userRoles.isAdmin) {
      const targetRoles = payload.targetDID ? await getRolesForDID(payload.targetDID) : null;
      if (!targetRoles || !targetRoles.isAdmin) {
        const err = new Error('Unauthorized: Admin role required for asset minting. Manager accounts cannot mint new assets.');
        err.status = 403;
        throw err;
      }
    }
  }

  const localResult = mockStore.mint(payload);

  if (!isBlockchainEnabled()) {
    return localResult;
  }

  try {
    const receipt = await mintAssetOnChain(payload);
    return {
      tokenId: localResult.tokenId,
      recipient: payload.recipient,
      targetDID: payload.targetDID,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (error.message && (error.message.includes('caller is not admin') || error.message.includes('AccessControl'))) {
      const err = new Error('Unauthorized: Admin role required for asset minting. Manager accounts cannot mint new assets.');
      err.status = 403;
      throw err;
    }
    console.warn('[assetService] On-chain mintAsset failed, using local fallback:', error.message);
    return { ...localResult, offlineFallback: true };
  }
}

/** Transfer digital asset */
async function transferAsset(payload) {
  if (payload.requesterDID) {
    const userRoles = await getRolesForDID(payload.requesterDID);
    if (!userRoles.isAdmin && !userRoles.isManager) {
      const targetRoles = payload.targetDID ? await getRolesForDID(payload.targetDID) : null;
      if (!targetRoles || (!targetRoles.isAdmin && !targetRoles.isManager)) {
        const err = new Error('Unauthorized: Admin or Manager role required for asset transfer.');
        err.status = 403;
        throw err;
      }
    }
  }

  const localResult = mockStore.transfer(payload);

  if (!isBlockchainEnabled()) {
    return localResult;
  }

  try {
    const receipt = await assignAssetOnChain(payload);
    return {
      tokenId: payload.tokenId,
      newOwner: payload.recipient,
      targetDID: payload.targetDID,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (error.message && (error.message.includes('caller is not admin or manager') || error.message.includes('AccessControl'))) {
      const err = new Error('Unauthorized: Admin or Manager role required for asset transfer.');
      err.status = 403;
      throw err;
    }
    console.warn('[assetService] On-chain transferAsset failed, using local fallback:', error.message);
    return { ...localResult, offlineFallback: true };
  }
}

/** Get asset owner information */
async function getAssetOwner(tokenId) {
  if (!isBlockchainEnabled()) {
    return mockStore.getOwner(tokenId);
  }

  try {
    const ownerInfo = await getAssetOwnerOnChain(tokenId);
    if (!ownerInfo.ownerAddress || ownerInfo.ownerAddress === '0x0000000000000000000000000000000000000000') {
      const err = new Error('Asset not found.');
      err.status = 404;
      throw err;
    }
    return {
      tokenId,
      ownerAddress: ownerInfo.ownerAddress,
      targetDID: ownerInfo.targetDID,
    };
  } catch (error) {
    if (error.status === 404) throw error;
    const err = new Error(`Asset not found: ${error.message}`);
    err.status = 404;
    throw err;
  }
}

/** Get assets by identity DID */
async function getAssetsByIdentity(targetDID) {
  if (!isBlockchainEnabled()) {
    return mockStore.getByDID(targetDID);
  }

  try {
    const tokenIds = await getAssetsByDIDOnChain(targetDID);
    const assets = await Promise.all(
      tokenIds.map(async (id) => {
        try {
          return await getAssetOnChain(id);
        } catch {
          return null;
        }
      }),
    );

    return {
      targetDID,
      tokenIds,
      assets: assets.filter(Boolean),
    };
  } catch (error) {
    return { targetDID, tokenIds: [], assets: [] };
  }
}

module.exports = {
  mintAsset,
  transferAsset,
  getAssetOwner,
  getAssetsByIdentity,
  mockStore,
};
