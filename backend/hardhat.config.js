require('dotenv').config();

const polygonAmoy = {
  url: process.env.BLOCKCHAIN_RPC_URL || '',
  accounts: process.env.BLOCKCHAIN_PRIVATE_KEY ? [process.env.BLOCKCHAIN_PRIVATE_KEY] : [],
};

const networks = process.env.BLOCKCHAIN_RPC_URL ? { polygonAmoy } : {};

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
