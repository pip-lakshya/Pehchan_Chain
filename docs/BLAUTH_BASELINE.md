# BLAuth Baseline Specification & Architecture

## Overview
BLAuth is a privacy-first, biometric-authenticated identity and credential disclosure system built as the foundational baseline for **PehchanChain** (Smart India Hackathon 2026, Problem Statement SIH26125 for Bharat Electronics Limited).

## Baseline Components

### 1. Backend (`/backend`)
- **Runtime**: Node.js (v20+ / v24 compatible)
- **Framework**: Express 5.2.1
- **Blockchain Interface**: ethers.js v6 targeting Polygon Amoy testnet (Chain ID `80002`)
- **Persistence**: File-backed JSON stores in `backend/data/` (`wallets.json`, `verification-requests.json`, `developer-apps.json`)
- **Health Check**: `GET /health` (`{ status: 'ok', service: 'BLAuth backend' }`)
- **Core Endpoints**:
  - `POST /identity/register`: Enrolls user identity with a bytes32 biometric commitment.
  - `POST /identity/authenticate`: Verifies biometric commitment against Polygon Amoy registry.
  - `GET /identity/:walletId`: Retrieves registered identity credentials.
  - `GET /identity/:walletId/disclosures`: Retrieves user disclosure history.
  - `POST /developer/apps`: Registers developer application (issues API key and secret).
  - `POST /developer/verify`: Initiates verification request as a developer application.
  - `POST /verify/request`: Initiates a verification request.
  - `POST /verify/consent`: Processes user consent, enforces selective disclosure and zero-knowledge derived claims (`ageOver18`).

### 2. Frontend (`/blauth-frontend`)
- **Framework**: React 19.2.8 + Vite 8.2.2 + React Router DOM 7.18.2
- **Local Biometrics**: `@vladmandic/face-api` (TinyFaceDetector, FaceLandmark68Net, FaceRecognitionNet) loaded locally from `/models`.
- **Client Storage**:
  - `IndexedDB` (`blauth-biometric` -> `descriptors` -> `enrolled`): stores 128-float face descriptor locally on the user's device.
  - `localStorage`: `blauthWalletId`, `blauthIdentity`.
- **Security Boundary**: Raw images, video frames, and descriptors never leave the client browser. Only SHA-256 IEEE-754 bytes32 commitments are sent to the backend.

### 3. Smart Contracts (`/backend/contracts`)
- **Compiler**: Solidity `^0.8.24` (Hardhat `2.22.18`)
- **Contract**: `CredentialRegistry.sol`
  - `registerCredential(bytes32 credentialHash)`: Commits credential hash on-chain.
  - `getCredential(bytes32 credentialHash)`: Returns wallet address, registration timestamp, and revocation state.
  - `isCredentialRegistered(bytes32 credentialHash)`: Queries registration existence.
  - `revokeCredential(bytes32 credentialHash)`: Allows wallet owner to revoke a commitment.

### 4. Test Suite Baseline
- **Runner**: Node.js native test runner (`node --test`)
- **Status**: 12 test suites, **115 passing tests**, 0 failures.

---

## Required Environment Variables

### Backend (`backend/.env`)
```bash
PORT=3000
CORS_ORIGIN=http://localhost:5173

# Blockchain (Polygon Amoy - Chain ID: 80002)
# Set to 'false' for local/mock offline development
BLOCKCHAIN_ENABLED=false
BLOCKCHAIN_RPC_URL=https://rpc-amoy.polygon.technology/
BLOCKCHAIN_PRIVATE_KEY=
BLOCKCHAIN_CONTRACT_ADDRESS=
```

### Frontend (`blauth-frontend/.env`)
```bash
# Optional: leave empty when using reverse proxy or same-origin deployment
VITE_API_BASE_URL=http://localhost:3000
```

---

## Quick Start & Verification Commands

### Start Backend
```bash
cd backend
npm start
# Server listens on http://localhost:3000
```

### Start Frontend
```bash
cd blauth-frontend
npm run dev
# Vite dev server listens on http://localhost:5173
```

### Run Tests
```bash
cd backend
npm test
# Expected output: 115 tests passing (0 failures)
```

### Compile Smart Contracts
```bash
cd backend
HARDHAT_DISABLE_TELEMETRY=true npm run compile:contract
```
