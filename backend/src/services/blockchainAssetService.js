/**
 * blockchainAssetService.js
 *
 * Backend integration service for PehchanAssetRegistry & PehchanAccessControl
 * on Polygon Amoy (chain ID: 80002).
 */

'use strict';

const POLYGON_AMOY_CHAIN_ID = 80002;

const assetRegistryAbi = [
  'function mintAsset(address to, string targetDID, string name, string category, string ipfsHash, bytes32 payloadHash) returns (uint256)',
  'function assignAsset(uint256 tokenId, address to, string targetDID)',
  'function getAsset(uint256 tokenId) view returns (uint256 id, string name, string category, string targetDID, string ipfsHash, bytes32 payloadHash, uint256 mintedAt, uint256 updatedAt)',
  'function getAssetOwner(uint256 tokenId) view returns (address ownerAddress, string targetDID, bytes32 targetDIDHash)',
  'function getAssetsByDID(string targetDID) view returns (uint256[])',
  'function totalAssets() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

const accessControlAbi = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function isAdmin(address account) view returns (bool)',
  'function isManager(address account) view returns (bool)',
  'function isAuditor(address account) view returns (bool)',
  'function isUser(address account) view returns (bool)',
];

function isBlockchainEnabled() {
  return process.env.BLOCKCHAIN_ENABLED === 'true';
}

function getAssetConfig() {
  const { BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, ASSET_REGISTRY_ADDR, ACCESS_CONTROL_ADDR } = process.env;

  if (!BLOCKCHAIN_RPC_URL || !BLOCKCHAIN_PRIVATE_KEY) {
    throw new Error('Blockchain RPC or private key configuration is incomplete.');
  }

  return {
    rpcUrl: BLOCKCHAIN_RPC_URL,
    privateKey: BLOCKCHAIN_PRIVATE_KEY,
    assetRegistryAddr: ASSET_REGISTRY_ADDR || null,
    accessControlAddr: ACCESS_CONTROL_ADDR || null,
  };
}

async function getProviderAndSigner() {
  const { JsonRpcProvider, Wallet } = await import('ethers');
  const { rpcUrl, privateKey } = getAssetConfig();

  const provider = new JsonRpcProvider(rpcUrl, { chainId: POLYGON_AMOY_CHAIN_ID, name: 'polygon-amoy' });
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== POLYGON_AMOY_CHAIN_ID) {
    throw new Error('Configured RPC endpoint is not Polygon Amoy.');
  }

  const signer = new Wallet(privateKey, provider);
  return { provider, signer };
}

async function getAssetContract() {
  const { Contract } = await import('ethers');
  const { assetRegistryAddr } = getAssetConfig();
  if (!assetRegistryAddr) {
    throw new Error('ASSET_REGISTRY_ADDR is not configured.');
  }
  const { signer } = await getProviderAndSigner();
  return new Contract(assetRegistryAddr, assetRegistryAbi, signer);
}

async function getAccessControlContract() {
  const { Contract } = await import('ethers');
  const { accessControlAddr } = getAssetConfig();
  if (!accessControlAddr) {
    throw new Error('ACCESS_CONTROL_ADDR is not configured.');
  }
  const { signer } = await getProviderAndSigner();
  return new Contract(accessControlAddr, accessControlAbi, signer);
}

/** Mint a new PehchanChain digital asset */
async function mintAssetOnChain({ to, recipient, targetDID, name, category, ipfsHash, payloadHash }) {
  if (!isBlockchainEnabled()) return null;
  const destinationAddress = to || recipient;
  if (!destinationAddress) {
    throw new Error('Recipient address is required for minting on-chain asset.');
  }
  const contract = await getAssetContract();
  const tx = await contract.mintAsset(
    destinationAddress,
    targetDID,
    name,
    category,
    ipfsHash || '',
    payloadHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
  );
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/** Assign/transfer an asset to a new recipient and DID */
async function assignAssetOnChain({ tokenId, to, recipient, targetDID }) {
  if (!isBlockchainEnabled()) return null;
  const destinationAddress = to || recipient;
  if (!destinationAddress) {
    throw new Error('Recipient address is required for assigning on-chain asset.');
  }
  const contract = await getAssetContract();
  const tx = await contract.assignAsset(tokenId, destinationAddress, targetDID);
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/** Query single asset by tokenId */
async function getAssetOnChain(tokenId) {
  const contract = await getAssetContract();
  const asset = await contract.getAsset(tokenId);
  return {
    id: asset.id.toString(),
    name: asset.name,
    category: asset.category,
    targetDID: asset.targetDID,
    ipfsHash: asset.ipfsHash,
    payloadHash: asset.payloadHash,
    mintedAt: asset.mintedAt.toString(),
    updatedAt: asset.updatedAt.toString(),
  };
}

/** Query owner address and DID binding for a token */
async function getAssetOwnerOnChain(tokenId) {
  const contract = await getAssetContract();
  const info = await contract.getAssetOwner(tokenId);
  return {
    ownerAddress: info.ownerAddress,
    targetDID: info.targetDID,
    targetDIDHash: info.targetDIDHash,
  };
}

/** Query token IDs associated with target DID */
async function getAssetsByDIDOnChain(targetDID) {
  const contract = await getAssetContract();
  const tokenIds = await contract.getAssetsByDID(targetDID);
  return tokenIds.map((id) => id.toString());
}

module.exports = {
  POLYGON_AMOY_CHAIN_ID,
  isBlockchainEnabled,
  getAssetConfig,
  getAssetContract,
  getAccessControlContract,
  mintAssetOnChain,
  assignAssetOnChain,
  getAssetOnChain,
  getAssetOwnerOnChain,
  getAssetsByDIDOnChain,
};
