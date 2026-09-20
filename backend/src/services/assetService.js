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

const fs = require('fs');
const path = require('path');
const ASSETS_FILE_PATH = path.resolve(__dirname, '../../data/assets.json');

// Persistent mock store for offline/fallback testing
class MockAssetStore {
  constructor() {
    this.assets = new Map(); // tokenId string => asset object
    this.didToTokens = new Map(); // targetDID => Set of tokenId strings
    this.nextTokenId = 1n;
    this.loadFromDisk();
  }

  seedDefaults() {
    const defaultAssets = [
      {
        tokenId: "1",
        ownerAddress: "0xebacaEc8C8bC1E7e2D37355788DdB22C1EB209FD",
        targetDID: "did:pehchan:wallet_384afd2d-70a9-41c4-8b5c-0d2c837a3280",
        name: "Defence Project Clearance ID",
        category: "SECURITY_CLEARANCE",
        ipfsHash: "ipfs://QmPehchanClearance001",
        payloadHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        mintedAt: "1789884470",
        updatedAt: "1789884470",
      },
      {
        tokenId: "2",
        ownerAddress: "0xebacaEc8C8bC1E7e2D37355788DdB22C1EB209FD",
        targetDID: "did:pehchan:wallet_384afd2d-70a9-41c4-8b5c-0d2c837a3280",
        name: "BEL Defence Engineer Credential",
        category: "ENGINEERING_LICENSE",
        ipfsHash: "ipfs://QmPehchanEngineer002",
        payloadHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        mintedAt: "1789884470",
        updatedAt: "1789884470",
      },
    ];

    let maxId = 0n;
    for (const asset of defaultAssets) {
      if (!this.assets.has(asset.tokenId)) {
        this.assets.set(asset.tokenId, asset);
        if (!this.didToTokens.has(asset.targetDID)) {
          this.didToTokens.set(asset.targetDID, new Set());
        }
        this.didToTokens.get(asset.targetDID).add(asset.tokenId);
      }
    }

    for (const idStr of this.assets.keys()) {
      try {
        const currentBig = BigInt(idStr);
        if (currentBig > maxId) maxId = currentBig;
      } catch {}
    }
    this.nextTokenId = maxId + 1n;
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(ASSETS_FILE_PATH)) {
        const raw = fs.readFileSync(ASSETS_FILE_PATH, "utf8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          let maxId = 0n;
          for (const asset of list) {
            const idStr = String(asset.tokenId || asset.id);
            this.assets.set(idStr, asset);

            const targetDID = asset.targetDID;
            if (targetDID) {
              if (!this.didToTokens.has(targetDID)) {
                this.didToTokens.set(targetDID, new Set());
              }
              this.didToTokens.get(targetDID).add(idStr);
            }

            try {
              const currentBig = BigInt(idStr);
              if (currentBig > maxId) maxId = currentBig;
            } catch {
              // skip non-numeric ids
            }
          }
          this.nextTokenId = maxId + 1n;
        }
      }
    } catch (err) {
      console.warn("[MockAssetStore] Error loading assets from disk:", err.message);
    }
    this.seedDefaults();
  }

  saveToDisk() {
    try {
      const dir = path.dirname(ASSETS_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.assets.values());
      fs.writeFileSync(ASSETS_FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[MockAssetStore] Error saving assets to disk:', err.message);
    }
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

    this.saveToDisk();

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

    this.saveToDisk();

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
    this.seedDefaults();
    this.saveToDisk();
  }
}

const mockStore = new MockAssetStore();

const { getRolesForDID } = require('./rbacService');

/** Mint digital asset */
async function mintAsset(payload) {
  if (payload.requesterDID) {
    const userRoles = await getRolesForDID(payload.requesterDID);
    const targetRoles = payload.targetDID ? await getRolesForDID(payload.targetDID) : null;

    const hasAdminRole = userRoles.isAdmin || (targetRoles && targetRoles.isAdmin);

    if (!hasAdminRole) {
      const err = new Error('Unauthorized: Admin role required for asset minting. Manager accounts cannot mint new assets.');
      err.status = 403;
      throw err;
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
    console.warn('[assetService] On-chain mintAsset failed, using local fallback:', error.message);
    return { ...localResult, offlineFallback: true };
  }
}

/** Transfer digital asset */
async function transferAsset(payload) {
  if (payload.requesterDID) {
    const userRoles = await getRolesForDID(payload.requesterDID);
    const targetRoles = payload.targetDID ? await getRolesForDID(payload.targetDID) : null;

    const hasTransferRole =
      userRoles.isAdmin ||
      userRoles.isManager ||
      (targetRoles && (targetRoles.isAdmin || targetRoles.isManager));

    if (!hasTransferRole) {
      const err = new Error('Unauthorized: Admin or Manager role required for asset transfer.');
      err.status = 403;
      throw err;
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
      return mockStore.getOwner(tokenId);
    }
    return {
      tokenId,
      ownerAddress: ownerInfo.ownerAddress,
      targetDID: ownerInfo.targetDID,
    };
  } catch (error) {
    try {
      return mockStore.getOwner(tokenId);
    } catch {
      const err = new Error(`Asset not found: Token ID #${tokenId} does not exist on-chain or in local store.`);
      err.status = 404;
      throw err;
    }
  }
}

/** Get assets by identity DID */
async function getAssetsByIdentity(targetDID) {
  const localData = mockStore.getByDID(targetDID);

  if (!isBlockchainEnabled()) {
    return localData;
  }

  try {
    const tokenIds = await getAssetsByDIDOnChain(targetDID);
    const onChainAssets = await Promise.all(
      tokenIds.map(async (id) => {
        try {
          return await getAssetOnChain(id);
        } catch {
          return null;
        }
      }),
    );
    const validOnChain = onChainAssets.filter(Boolean);

    const tokenSet = new Set([...tokenIds, ...localData.tokenIds]);
    const assetMap = new Map();
    for (const a of localData.assets) {
      if (a) assetMap.set(String(a.tokenId || a.id), a);
    }
    for (const a of validOnChain) {
      if (a) assetMap.set(String(a.tokenId || a.id), a);
    }

    return {
      targetDID,
      tokenIds: Array.from(tokenSet),
      assets: Array.from(assetMap.values()),
    };
  } catch (error) {
    return localData;
  }
}

module.exports = {
  mintAsset,
  transferAsset,
  getAssetOwner,
  getAssetsByIdentity,
  mockStore,
};
