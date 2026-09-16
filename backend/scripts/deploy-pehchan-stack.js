/**
 * deploy-pehchan-stack.js
 *
 * Deploys the complete PehchanChain smart contract stack to the target network:
 *   1. PehchanAccessControl (Hub)
 *   2. CredentialRegistry (linked to PehchanAccessControl)
 *   3. PehchanAssetRegistry (ERC-721, linked to PehchanAccessControl & CredentialRegistry)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-pehchan-stack.js --network polygonAmoy
 */

'use strict';

const { ethers, hre } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  PehchanChain — Full Smart Contract Stack Deployment');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Network:   ${hre.network.name}`);
  console.log(`  Deployer:  ${deployerAddress}`);

  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log(`  Balance:   ${ethers.formatEther(balance)} MATIC`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has zero balance. Fund it before deploying.');
  }

  // 1. Deploy PehchanAccessControl
  console.log('\n[1/3] Deploying PehchanAccessControl...');
  const AccessControlFactory = await ethers.getContractFactory('PehchanAccessControl');
  const accessControl = await AccessControlFactory.deploy(deployerAddress);
  await accessControl.waitForDeployment();
  const acAddress = await accessControl.getAddress();
  console.log(`  ✔ PehchanAccessControl deployed to: ${acAddress}`);

  // 2. Deploy CredentialRegistry
  console.log('\n[2/3] Deploying CredentialRegistry...');
  const CredentialRegistryFactory = await ethers.getContractFactory('CredentialRegistry');
  const credentialRegistry = await CredentialRegistryFactory.deploy(acAddress);
  await credentialRegistry.waitForDeployment();
  const crAddress = await credentialRegistry.getAddress();
  console.log(`  ✔ CredentialRegistry deployed to: ${crAddress}`);

  // 3. Deploy PehchanAssetRegistry
  console.log('\n[3/3] Deploying PehchanAssetRegistry...');
  const AssetRegistryFactory = await ethers.getContractFactory('PehchanAssetRegistry');
  const assetRegistry = await AssetRegistryFactory.deploy(
    'PehchanChain Asset',
    'PCNA',
    acAddress,
    crAddress
  );
  await assetRegistry.waitForDeployment();
  const arAddress = await assetRegistry.getAddress();
  console.log(`  ✔ PehchanAssetRegistry deployed to: ${arAddress}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Deployment Summary:');
  console.log(`    ACCESS_CONTROL_ADDR=${acAddress}`);
  console.log(`    CREDENTIAL_REGISTRY_ADDR=${crAddress}`);
  console.log(`    ASSET_REGISTRY_ADDR=${arAddress}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  });
