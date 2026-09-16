/**
 * deploy-pehchan-stack.js
 *
 * Deploys the complete PehchanChain smart contract stack to the target network (Polygon Amoy / chain ID 80002):
 *   1. PehchanAccessControl (Hub)
 *   2. CredentialRegistry (linked to PehchanAccessControl)
 *   3. PehchanAssetRegistry (ERC-721, linked to PehchanAccessControl & CredentialRegistry)
 *
 * Usage:
 *   node scripts/deploy-pehchan-stack.js
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const POLYGON_AMOY_CHAIN_ID = 80002;

function loadArtifact(contractName) {
  const artifactPath = path.resolve(
    __dirname,
    `../artifacts/contracts/${contractName}.sol/${contractName}.json`,
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found for ${contractName} at ${artifactPath}. Run 'npm run compile:contract' first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  const { BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY } = process.env;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  PehchanChain — Full Smart Contract Stack Deployment');
  console.log('═══════════════════════════════════════════════════════');

  if (!BLOCKCHAIN_RPC_URL || !BLOCKCHAIN_PRIVATE_KEY) {
    throw new Error('BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY are required in backend/.env for deployment.');
  }

  const { JsonRpcProvider, Wallet, ContractFactory, formatEther } = await import('ethers');

  const provider = new JsonRpcProvider(BLOCKCHAIN_RPC_URL, { chainId: POLYGON_AMOY_CHAIN_ID, name: 'polygon-amoy' });
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== POLYGON_AMOY_CHAIN_ID) {
    throw new Error(`Configured RPC endpoint chain ID (${network.chainId}) is not Polygon Amoy (${POLYGON_AMOY_CHAIN_ID}).`);
  }

  const signer = new Wallet(BLOCKCHAIN_PRIVATE_KEY, provider);
  const deployerAddress = await signer.getAddress();
  const balance = await provider.getBalance(deployerAddress);

  console.log(`  Target Network: Polygon Amoy (${POLYGON_AMOY_CHAIN_ID})`);
  console.log(`  Deployer:       ${deployerAddress}`);
  console.log(`  Balance:        ${formatEther(balance)} MATIC\n`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has zero MATIC balance. Fund the account on Polygon Amoy faucet before deploying.');
  }

  // 1. Deploy PehchanAccessControl
  console.log('[1/3] Deploying PehchanAccessControl...');
  const acArtifact = loadArtifact('PehchanAccessControl');
  const acFactory = new ContractFactory(acArtifact.abi, acArtifact.bytecode, signer);
  const acContract = await acFactory.deploy(deployerAddress);
  await acContract.waitForDeployment();
  const acAddress = await acContract.getAddress();
  console.log(`  ✔ PehchanAccessControl deployed to: ${acAddress}`);

  // 2. Deploy CredentialRegistry
  console.log('\n[2/3] Deploying CredentialRegistry...');
  const crArtifact = loadArtifact('CredentialRegistry');
  const crFactory = new ContractFactory(crArtifact.abi, crArtifact.bytecode, signer);
  const crContract = await crFactory.deploy(acAddress);
  await crContract.waitForDeployment();
  const crAddress = await crContract.getAddress();
  console.log(`  ✔ CredentialRegistry deployed to: ${crAddress}`);

  // 3. Deploy PehchanAssetRegistry
  console.log('\n[3/3] Deploying PehchanAssetRegistry...');
  const arArtifact = loadArtifact('PehchanAssetRegistry');
  const arFactory = new ContractFactory(arArtifact.abi, arArtifact.bytecode, signer);
  const arContract = await arFactory.deploy('PehchanChain Asset', 'PCNA', acAddress, crAddress);
  await arContract.waitForDeployment();
  const arAddress = await arContract.getAddress();
  console.log(`  ✔ PehchanAssetRegistry deployed to: ${arAddress}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Deployment Complete! Add these contract addresses to backend/.env:');
  console.log(`    ACCESS_CONTROL_ADDR=${acAddress}`);
  console.log(`    CREDENTIAL_REGISTRY_ADDR=${crAddress}`);
  console.log(`    ASSET_REGISTRY_ADDR=${arAddress}`);
  console.log(`    BLOCKCHAIN_CONTRACT_ADDRESS=${crAddress}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('\nDeployment failed:', error.message);
  process.exitCode = 1;
});
