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
      throw new Error('Wallet data store is invalid.');
    }

    return wallets;
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
