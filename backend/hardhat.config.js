require('dotenv').config();

const isValidPrivateKey = (key) => typeof key === 'string' && /^(0x)?[0-9a-fA-F]{64}$/.test(key.trim());

const polygonAmoy = {
  url: process.env.BLOCKCHAIN_RPC_URL || '',
  accounts: isValidPrivateKey(process.env.BLOCKCHAIN_PRIVATE_KEY) ? [process.env.BLOCKCHAIN_PRIVATE_KEY.trim()] : [],
};

const networks = (process.env.BLOCKCHAIN_RPC_URL && polygonAmoy.accounts.length > 0) ? { polygonAmoy } : {};

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      evmVersion: 'cancun',
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
};
