const fs = require('fs/promises');
const path = require('path');

class WalletStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readWallets() {
    let wallets = [];
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      wallets = JSON.parse(contents);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!Array.isArray(wallets)) {
      wallets = [];
    }

    const seeded = this.seedDefaults(wallets);
    if (seeded) {
      try {
        await this.writeWallets(wallets);
      } catch (err) {
        console.warn('[WalletStore] Could not write seeded wallets to disk:', err.message);
      }
    }

    return wallets;
  }

  seedDefaults(wallets) {
    if (process.env.WALLET_DATA_FILE) {
      return false;
    }
    const defaultWallets = [
      {
        walletId: 'wallet_384afd2d-70a9-41c4-8b5c-0d2c837a3280',
        credentials: {
          name: 'Rajesh Kumar',
          studentId: 'BEL-2026-001',
          email: 'rajesh.kumar@bel.co.in',
          phone: '+919876543210',
          dob: '2002-05-15',
        },
        createdAt: '2026-09-19T05:39:26.901Z',
        disclosureHistory: [],
        biometricCommitment: '0xb0d145e8fb14509f3d53bee10386497df63afbd1d20110209e4a66ac8d64809c',
      },
      {
        walletId: 'wallet_9302762e-d1b5-487e-8a41-fdef26fad4ef',
        credentials: {
          name: 'Admin Security Officer (BEL)',
          studentId: 'BEL-ADMIN-002',
          email: 'admin2@bel.co.in',
          phone: '+919876543211',
          dob: '1990-01-01',
        },
        createdAt: '2026-09-20T10:00:00.000Z',
        disclosureHistory: [],
        biometricCommitment: '0xc1e234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      },
    ];

    let changed = false;
    for (const defWallet of defaultWallets) {
      if (!wallets.some((w) => w.walletId === defWallet.walletId)) {
        wallets.push(defWallet);
        changed = true;
      }
    }
    return changed;
  }

  async findByWalletId(walletId) {
    const wallets = await this.readWallets();
    const cleanId = walletId ? walletId.replace(/^did:pehchan:/, '') : walletId;
    return wallets.find((wallet) => wallet.walletId === walletId || wallet.walletId === cleanId) || null;
  }

  async findByBiometricCommitment(biometricCommitment) {
    const wallets = await this.readWallets();
    return wallets.find((wallet) => wallet.biometricCommitment === biometricCommitment) || null;
  }

  async findByCredentials(credentials) {
    const wallets = await this.readWallets();
    const fields = ['name', 'studentId', 'email', 'phone', 'dob'];
    return wallets.find((wallet) => fields.every(
      (field) => wallet.credentials && wallet.credentials[field] === credentials[field],
    )) || null;
  }

  async save(wallet) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const wallets = await this.readWallets();

    wallets.push(wallet);
    await this.writeWallets(wallets);
  }

  async update(wallet) {
    const wallets = await this.readWallets();
    const walletIndex = wallets.findIndex((storedWallet) => storedWallet.walletId === wallet.walletId);

    if (walletIndex === -1) {
      throw new Error('Wallet does not exist.');
    }

    wallets[walletIndex] = wallet;
    await this.writeWallets(wallets);
  }

  async writeWallets(wallets) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(wallets, null, 2), 'utf8');
  }
}

function getWalletStore() {
  const defaultPath = path.resolve(__dirname, '../../data/wallets.json');
  return new WalletStore(process.env.WALLET_DATA_FILE || defaultPath);
}

module.exports = { getWalletStore, WalletStore };
