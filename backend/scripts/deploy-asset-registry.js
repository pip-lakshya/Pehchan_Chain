/**
 * deploy-asset-registry.js
 *
 * Deploys PehchanAssetRegistry to the configured network (default: Polygon Amoy).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-asset-registry.js --network polygonAmoy
 *
 * Required environment variables (set in backend/.env):
 *   BLOCKCHAIN_RPC_URL       — Polygon Amoy RPC endpoint
 *   BLOCKCHAIN_PRIVATE_KEY   — Deployer wallet private key (must be admin)
 *   CREDENTIAL_REGISTRY_ADDR — (optional) Deployed CredentialRegistry contract address
 *
 * After deployment, update backend/.env with:
 *   ASSET_REGISTRY_ADDR=<deployed address>
 */

'use strict';

const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  PehchanChain — PehchanAssetRegistry Deployment');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Network:   ${hre.network.name}`);
  console.log(`  Deployer:  ${deployerAddress}`);

  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log(`  Balance:   ${ethers.formatEther(balance)} MATIC`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has zero balance. Fund it before deploying.');
  }

  // ── Configuration ──────────────────────────────────────────────────────────
  const TOKEN_NAME   = 'PehchanChain Asset';
  const TOKEN_SYMBOL = 'PCNA';

  // The admin of the registry (defaults to deployer; can be a multisig address)
  const INITIAL_ADMIN = process.env.ASSET_REGISTRY_ADMIN || deployerAddress;

  // Address of the existing BLAuth CredentialRegistry (set to ZeroAddress if not linking yet)
  const CREDENTIAL_REGISTRY = process.env.CREDENTIAL_REGISTRY_ADDR || ethers.ZeroAddress;

  console.log('\n  Deployment parameters:');
  console.log(`    Token name:         ${TOKEN_NAME}`);
  console.log(`    Token symbol:       ${TOKEN_SYMBOL}`);
  console.log(`    Initial admin:      ${INITIAL_ADMIN}`);
  console.log(`    CredentialRegistry: ${CREDENTIAL_REGISTRY}`);
  console.log('');

  // ── Deploy ─────────────────────────────────────────────────────────────────
  const PehchanAssetRegistry = await ethers.getContractFactory('PehchanAssetRegistry');
  console.log('  Deploying PehchanAssetRegistry…');

  const registry = await PehchanAssetRegistry.deploy(
    TOKEN_NAME,
    TOKEN_SYMBOL,
    INITIAL_ADMIN,
    CREDENTIAL_REGISTRY,
  );

  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();

  console.log('\n  ✔ PehchanAssetRegistry deployed successfully');
  console.log(`    Contract address:   ${contractAddress}`);
  console.log(`    Transaction hash:   ${deployTx.hash}`);
  console.log(`    Block:              ${deployTx.blockNumber ?? '(pending)'}`);

  // ── Verification hint ──────────────────────────────────────────────────────
  console.log('\n  Next steps:');
  console.log(`  1. Add to backend/.env:`);
  console.log(`       ASSET_REGISTRY_ADDR=${contractAddress}`);
  console.log(`  2. Verify on PolygonScan Amoy:`);
  console.log(`       npx hardhat verify --network polygonAmoy ${contractAddress} \\\`);
  console.log(`         "${TOKEN_NAME}" "${TOKEN_SYMBOL}" "${INITIAL_ADMIN}" "${CREDENTIAL_REGISTRY}"`);
  console.log('═══════════════════════════════════════════════════════\n');

  return contractAddress;
}

// ── Entry point ────────────────────────────────────────────────────────────
main()
  .then((address) => {
    console.log(`Deployment complete: ${address}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nDeployment failed:', error.message);
    process.exit(1);
  });
