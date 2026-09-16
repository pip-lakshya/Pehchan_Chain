/**
 * seed-demo.js
 *
 * Seeding script for SIH Demo Presentation.
 * Populates deterministic demo data for Admin, Manager, Demo User, and Developer SDK.
 * Run via: npm run seed
 */

'use strict';

const fs = require('fs/promises');
const path = require('path');

const dataDir = path.resolve(__dirname, '../data');

const demoWallets = [
  {
    walletId: 'wallet_admin_01',
    credentials: {
      name: 'Admin Security Officer (BEL)',
      studentId: 'ADMIN-001',
      email: 'admin.security@bel.co.in',
      phone: '+919900000001',
      dob: '1985-01-01',
    },
    biometricCommitment: '0x1111111111111111111111111111111111111111111111111111111111111111',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    disclosureHistory: [],
  },
  {
    walletId: 'wallet_manager_01',
    credentials: {
      name: 'Manager Operations Officer (BEL)',
      studentId: 'MGR-002',
      email: 'manager.ops@bel.co.in',
      phone: '+919900000002',
      dob: '1988-06-15',
    },
    biometricCommitment: '0x2222222222222222222222222222222222222222222222222222222222222222',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    disclosureHistory: [],
  },
  {
    walletId: 'wallet_demo_student',
    credentials: {
      name: 'Rajesh Kumar',
      studentId: 'BEL-2026-001',
      email: 'rajesh.kumar@bel.co.in',
      phone: '+919876543210',
      dob: '2002-05-15',
    },
    biometricCommitment: '0x3333333333333333333333333333333333333333333333333333333333333333',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    disclosureHistory: [
      {
        disclosureId: 'disclosure_demo_01',
        requestId: 'req_demo_prev_01',
        verifierId: 'bel-gate-verifier-01',
        requestedFields: ['name', 'studentId', 'email'],
        approvedFields: ['name', 'studentId'],
        disclosedFields: ['name', 'studentId'],
        withheldFields: ['email'],
        outcome: 'APPROVED',
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
  },
];

const demoRequests = [
  {
    requestId: 'req_demo_verifier_01',
    walletId: 'wallet_demo_student',
    verifierId: 'bel-security-gate-01',
    requestedFields: ['name', 'studentId', 'email', 'phone', 'dob'],
    status: 'PENDING',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

const demoDeveloperApps = [
  {
    appId: 'app_bel_partner_01',
    name: 'BEL Defense Partner Portal',
    apiKey: 'blauth_pk_demo_partner_01',
    apiSecretHash: '0x8f4b0051a66e6b8c8d8c6b701c9b6b701c9b6b701c9b6b701c9b6b701c9b6b70',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
];

async function seed() {
  console.log('🌱 Seeding PehchanChain SIH Demo Data...');
  await fs.mkdir(dataDir, { recursive: true });

  await fs.writeFile(
    path.join(dataDir, 'wallets.json'),
    JSON.stringify(demoWallets, null, 2),
    'utf8',
  );
  console.log('✔ Seeded demo wallets (Admin, Manager, Demo User)');

  await fs.writeFile(
    path.join(dataDir, 'verification-requests.json'),
    JSON.stringify(demoRequests, null, 2),
    'utf8',
  );
  console.log('✔ Seeded verification requests');

  await fs.writeFile(
    path.join(dataDir, 'developer-apps.json'),
    JSON.stringify(demoDeveloperApps, null, 2),
    'utf8',
  );
  console.log('✔ Seeded developer applications');

  console.log('🎉 SIH Demo Seeding Complete! Demo User walletId: wallet_demo_student');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
