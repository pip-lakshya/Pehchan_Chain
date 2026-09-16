const { createCredentialHash } = require('../utils/credentialHash');

const POLYGON_AMOY_CHAIN_ID = 80002;
const credentialRegistryAbi = [
  'function registerCredential(bytes32 credentialHash)',
  'function getCredential(bytes32 credentialHash) view returns (address walletAddress, uint256 registeredAt, bool revoked)',
  'function isCredentialRegistered(bytes32 credentialHash) view returns (bool)',
  'function revokeCredential(bytes32 credentialHash)',
];

function isBlockchainEnabled() {
  return process.env.BLOCKCHAIN_ENABLED === 'true';
}

function getBlockchainConfig() {
  const { BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, BLOCKCHAIN_CONTRACT_ADDRESS, CREDENTIAL_REGISTRY_ADDR } = process.env;
  const contractAddress = CREDENTIAL_REGISTRY_ADDR || BLOCKCHAIN_CONTRACT_ADDRESS;

  if (!BLOCKCHAIN_RPC_URL || !BLOCKCHAIN_PRIVATE_KEY || !contractAddress) {
    throw new Error('Blockchain configuration is incomplete.');
  }

  return { rpcUrl: BLOCKCHAIN_RPC_URL, privateKey: BLOCKCHAIN_PRIVATE_KEY, contractAddress };
}

async function getContract() {
  const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
  const { rpcUrl, privateKey, contractAddress } = getBlockchainConfig();
  const provider = new JsonRpcProvider(rpcUrl, { chainId: POLYGON_AMOY_CHAIN_ID, name: 'polygon-amoy' });
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== POLYGON_AMOY_CHAIN_ID) {
    throw new Error('Configured RPC endpoint is not Polygon Amoy.');
  }

  const signer = new Wallet(privateKey, provider);
  return new Contract(contractAddress, credentialRegistryAbi, signer);
}

async function registerCredentialOnChain(credentials) {
  if (!isBlockchainEnabled()) {
    return null;
  }

  return registerCredentialHashOnChain(createCredentialHash(credentials));
}

async function registerCredentialHashOnChain(credentialHash) {
  if (!isBlockchainEnabled()) {
    return null;
  }
  const contract = await getContract();
  const transaction = await contract.registerCredential(credentialHash);
  const receipt = await transaction.wait();

  return { credentialHash, transactionHash: receipt.hash };
}

async function getCredentialStatus(credentials) {
  return getCredentialStatusByHash(createCredentialHash(credentials));
}

async function getCredentialStatusByHash(credentialHash) {
  const contract = await getContract();
  const isRegistered = await contract.isCredentialRegistered(credentialHash);

  if (!isRegistered) {
    return { credentialHash, isRegistered: false, walletAddress: null, registeredAt: null, revoked: false };
  }

  const credential = await contract.getCredential(credentialHash);

  return {
    credentialHash,
    isRegistered,
    walletAddress: credential.walletAddress,
    // ethers returns Solidity uint256 values as bigint, which cannot be sent in JSON.
    registeredAt: credential.registeredAt.toString(),
    revoked: credential.revoked,
  };
}

async function revokeCredentialOnChain(credentials) {
  const credentialHash = createCredentialHash(credentials);
  const contract = await getContract();
  const transaction = await contract.revokeCredential(credentialHash);
  const receipt = await transaction.wait();

  return { credentialHash, transactionHash: receipt.hash };
}

module.exports = {
  POLYGON_AMOY_CHAIN_ID,
  createCredentialHash,
  getCredentialStatus,
  getCredentialStatusByHash,
  isBlockchainEnabled,
  registerCredentialOnChain,
  registerCredentialHashOnChain,
  revokeCredentialOnChain,
};
