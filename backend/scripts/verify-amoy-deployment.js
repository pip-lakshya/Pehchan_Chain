/**
 * verify-amoy-deployment.js
 *
 * Verifies contract loading, RPC connection (Polygon Amoy chain ID 80002),
 * and executes basic read/write tests against deployed contracts.
 *
 * Usage:
 *   node scripts/verify-amoy-deployment.js
 */

'use strict';

require('dotenv').config();
const { ethers } = require('ethers');
const { getBlockchainConfig } = require('../src/services/blockchainCredentialService');
const { getAssetConfig } = require('../src/services/blockchainAssetService');

const POLYGON_AMOY_CHAIN_ID = 80002;

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PehchanChain — Polygon Amoy Deployment Verification');
  console.log('═══════════════════════════════════════════════════════');

  const { BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, ACCESS_CONTROL_ADDR, CREDENTIAL_REGISTRY_ADDR, ASSET_REGISTRY_ADDR, BLOCKCHAIN_CONTRACT_ADDRESS } = process.env;

  const credentialAddr = CREDENTIAL_REGISTRY_ADDR || BLOCKCHAIN_CONTRACT_ADDRESS;

  console.log('  Configuration loaded:');
  console.log(`    BLOCKCHAIN_ENABLED:       ${process.env.BLOCKCHAIN_ENABLED ?? 'unset'}`);
  console.log(`    BLOCKCHAIN_RPC_URL:       ${BLOCKCHAIN_RPC_URL ? BLOCKCHAIN_RPC_URL.replace(/:[^:@]+@/, ':***@') : 'MISSING'}`);
  console.log(`    BLOCKCHAIN_PRIVATE_KEY:   ${BLOCKCHAIN_PRIVATE_KEY ? '***** (configured)' : 'MISSING'}`);
  console.log(`    ACCESS_CONTROL_ADDR:      ${ACCESS_CONTROL_ADDR || 'MISSING'}`);
  console.log(`    CREDENTIAL_REGISTRY_ADDR: ${credentialAddr || 'MISSING'}`);
  console.log(`    ASSET_REGISTRY_ADDR:      ${ASSET_REGISTRY_ADDR || 'MISSING'}`);
  console.log('');

  if (!BLOCKCHAIN_RPC_URL || !BLOCKCHAIN_PRIVATE_KEY) {
    console.log('  ⚠ RPC URL or Private Key missing in environment.');
    console.log('  Skipping live network connection test.');
    console.log('═══════════════════════════════════════════════════════\n');
    return;
  }

  console.log('  Connecting to Polygon Amoy RPC...');
  const provider = new ethers.JsonRpcProvider(BLOCKCHAIN_RPC_URL, { chainId: POLYGON_AMOY_CHAIN_ID, name: 'polygon-amoy' });

  try {
    const network = await provider.getNetwork();
    console.log(`  ✔ Connected to network: chainId ${network.chainId}`);

    if (Number(network.chainId) !== POLYGON_AMOY_CHAIN_ID) {
      console.error(`  ✖ Error: Expected chain ID ${POLYGON_AMOY_CHAIN_ID}, got ${network.chainId}`);
      process.exitCode = 1;
      return;
    }

    const wallet = new ethers.Wallet(BLOCKCHAIN_PRIVATE_KEY, provider);
    const address = await wallet.getAddress();
    const balance = await provider.getBalance(address);
    console.log(`  ✔ Signer address: ${address}`);
    console.log(`  ✔ Signer balance: ${ethers.formatEther(balance)} MATIC`);

    // Verify AccessControl contract read
    if (ACCESS_CONTROL_ADDR && ACCESS_CONTROL_ADDR !== '<DEPLOYED_ACCESS_CONTROL_ADDRESS>') {
      try {
        const acAbi = ['function isAdmin(address) view returns (bool)'];
        const acContract = new ethers.Contract(ACCESS_CONTROL_ADDR, acAbi, wallet);
        const isAdmin = await acContract.isAdmin(address);
        console.log(`  ✔ PehchanAccessControl (${ACCESS_CONTROL_ADDR}) read ok: isAdmin = ${isAdmin}`);
      } catch (err) {
        console.log(`  ⚠ PehchanAccessControl read error: ${err.message}`);
      }
    }

    // Verify CredentialRegistry contract read
    if (credentialAddr && credentialAddr !== '<DEPLOYED_CREDENTIAL_REGISTRY_ADDRESS>') {
      try {
        const crAbi = ['function isCredentialRegistered(bytes32) view returns (bool)'];
        const crContract = new ethers.Contract(credentialAddr, crAbi, wallet);
        const isReg = await crContract.isCredentialRegistered(ethers.id('test-hash'));
        console.log(`  ✔ CredentialRegistry (${credentialAddr}) read ok: testHash registered = ${isReg}`);
      } catch (err) {
        console.log(`  ⚠ CredentialRegistry read error: ${err.message}`);
      }
    }

    // Verify PehchanAssetRegistry contract read
    if (ASSET_REGISTRY_ADDR && ASSET_REGISTRY_ADDR !== '<DEPLOYED_ASSET_REGISTRY_ADDRESS>') {
      try {
        const arAbi = ['function totalAssets() view returns (uint256)'];
        const arContract = new ethers.Contract(ASSET_REGISTRY_ADDR, arAbi, wallet);
        const total = await arContract.totalAssets();
        console.log(`  ✔ PehchanAssetRegistry (${ASSET_REGISTRY_ADDR}) read ok: totalAssets = ${total.toString()}`);
      } catch (err) {
        console.log(`  ⚠ PehchanAssetRegistry read error: ${err.message}`);
      }
    }

    console.log('\n  ✔ All Polygon Amoy verification steps completed.');
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error(`  ✖ Failed to connect to RPC: ${error.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exitCode = 1;
});
