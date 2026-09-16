require('dotenv').config();

const fs = require('fs');
const path = require('path');

const POLYGON_AMOY_CHAIN_ID = 80002;

async function main() {
  const { BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY } = process.env;
  if (!BLOCKCHAIN_RPC_URL || !BLOCKCHAIN_PRIVATE_KEY) {
    throw new Error('BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY are required for deployment.');
  }

  const { JsonRpcProvider, Wallet, ContractFactory } = await import('ethers');
  const artifactPath = path.resolve(
    __dirname,
    '../artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json',
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const provider = new JsonRpcProvider(BLOCKCHAIN_RPC_URL, { chainId: POLYGON_AMOY_CHAIN_ID, name: 'polygon-amoy' });
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== POLYGON_AMOY_CHAIN_ID) {
    throw new Error('Configured RPC endpoint is not Polygon Amoy.');
  }

  const accessControlAddr = process.env.ACCESS_CONTROL_ADDR;
  if (!accessControlAddr) {
    throw new Error('ACCESS_CONTROL_ADDR is required in environment.');
  }

  const signer = new Wallet(BLOCKCHAIN_PRIVATE_KEY, provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(accessControlAddr);
  const deploymentTransaction = contract.deploymentTransaction();

  await contract.waitForDeployment();
  console.log(`CredentialRegistry deployed to: ${await contract.getAddress()}`);
  console.log(`Deployment transaction: ${deploymentTransaction.hash}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
