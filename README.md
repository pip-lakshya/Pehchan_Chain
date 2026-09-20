# 🔐 PehchanChain

### Decentralized Identity, Access Control & Digital Asset Management Platform

> **PehchanChain** is a privacy-aware blockchain platform combining
> decentralized identity, local biometric authentication, consent-driven
> selective disclosure, smart-contract-based access control, and
> blockchain-backed digital asset ownership.

**SIH 2026 --- Problem Statement:** SIH26125\
**Organization:** Bharat Electronics Limited (BEL)\
**Theme:** Blockchain & Cybersecurity

------------------------------------------------------------------------

## 🎯 What is PehchanChain?

PehchanChain extends an identity/authentication foundation into a
unified platform for:

-   Decentralized Identity (DID)
-   Verifiable credentials and cryptographic commitments
-   Local biometric authentication
-   Consent-driven selective disclosure
-   Smart-contract-enforced RBAC
-   NFT-based digital asset management
-   Tamper-evident ownership and audit history
-   Manual and developer/API-based verification

### Core principle

> **Verify the claim you need --- not the entire identity.**

The platform is designed to minimize unnecessary personal-data exposure
while making identity, authorization, ownership, and lifecycle events
verifiable and auditable.

------------------------------------------------------------------------

## 🧩 Problem

Digital ecosystems increasingly require users to repeatedly prove
identity, permissions, qualifications, and ownership.

Key challenges include:

-   Repeated sharing of complete identity information
-   Excessive personal-data exposure during verification
-   Identity impersonation and credential compromise
-   Centralized dependency for identity and authorization
-   Inconsistent access-control enforcement
-   Difficulty proving digital-asset ownership
-   Fragmented audit trails
-   Privacy concerns around biometric authentication

PehchanChain connects **identity + consent + authorization + assets +
auditability** through one architecture.

------------------------------------------------------------------------

## 💡 Solution

``` text
Identity
   ↓
Local Authentication
   ↓
Decentralized Identity
   ↓
Credential / Commitment
   ↓
User Consent
   ↓
Selective Disclosure
   ↓
Role-Based Authorization
   ↓
Digital Asset Ownership
   ↓
Auditable Lifecycle
```

Instead of exposing an entire identity record, a verifier can request
only the attributes required for a specific purpose.

------------------------------------------------------------------------

# 🏗️ System Architecture

``` text
┌─────────────────────────────────────────────────────────────┐
│                         USERS / ACTORS                      │
│ Citizens │ Organizations │ Developers │ Administrators      │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  FRONTEND / APPLICATION LAYER               │
│ Registration │ Identity Wallet │ Authentication             │
│ Consent UI   │ Selective Disclosure │ Verifier              │
│ Admin/Manager Console │ Asset/NFT View │ Audit Dashboard   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND / SERVICES                       │
│ Auth │ Identity │ Credentials │ Consent │ Verification      │
│ RBAC │ Assets │ Developer API │ Audit & Logging             │
└───────────────┬──────────────────────────────┬──────────────┘
                │                              │
                ▼                              ▼
┌──────────────────────────┐      ┌───────────────────────────┐
│ DATA / LOCAL STORAGE     │      │ BLOCKCHAIN LAYER          │
│ IndexedDB                │      │ Polygon Amoy              │
│ Application Data         │      │ Chain ID: 80002           │
│ Consent/Audit Logs       │      │                           │
│ Metadata                 │      │ PehchanAccessControl      │
│                          │      │ CredentialRegistry        │
│ Raw biometric data       │      │ PehchanAssetRegistry      │
│ is not placed on-chain   │      │                           │
└──────────────────────────┘      └───────────────────────────┘
```

------------------------------------------------------------------------

# 🔑 Core Features

## 1. Decentralized Identity

DID-style identity:

``` text
did:pehchan:<wallet_id>
```

An identity wallet can associate identity attributes, credentials,
digital assets, verification history, and disclosure history.

## 2. Local Biometric Authentication

Biometric processing is designed to remain local to the user's
device/browser.

Principles:

-   Raw biometric data is not transmitted to the backend
-   Browser-local biometric processing
-   IndexedDB/local storage for biometric-related data
-   SHA-256 biometric commitment
-   Biometric authentication as a local trust factor

## 3. Consent-Driven Selective Disclosure

Example request:

``` text
Verifier requests:
Name | Student ID | Email | Phone | DOB
```

User approves:

``` text
Name | Student ID
```

Verifier receives only the approved fields.

``` text
Verifier Request
       ↓
User Consent
       ↓
Approved Attributes
       ↓
Minimal Disclosure
```

## 4. Two Verification Modes

### Manual Verifier

``` text
Verifier → Search DID → Request Fields
        → User Consent → Authentication
        → Approved Fields → Verifier → Audit
```

### Developer API / SDK

Conceptually:

``` javascript
PehchanChain.authenticate({
  requestedFields: ["name", "studentId"]
});
```

Both modes use the same underlying consent mechanism.

> **One consent engine --- multiple verification surfaces.**

## 5. Smart-Contract RBAC

Roles include:

  Role                   Purpose
  ---------------------- -----------------------------------------
  `DEFAULT_ADMIN_ROLE`   Base contract administration
  `ADMIN_ROLE`           Platform administration
  `MANAGER_ROLE`         Operational asset/permission management
  `AUDITOR_ROLE`         Audit-oriented access
  `USER_ROLE`            Standard identity-holder permissions

## 6. Digital Asset Management

PehchanChain uses an ERC-721-based asset registry.

Example:

> **Defence Project Clearance ID**

``` text
Admin
  ↓
Mint Asset
  ↓
ERC-721 Token
  ↓
Assign to Identity
  ↓
User Wallet
  ↓
Ownership / History
  ↓
Audit
```

Asset metadata can include name, category, IPFS hash, payload hash, and
identity association.

## 7. Hybrid Audit

**On-chain:** role changes, asset minting, assignment,
ownership/lifecycle events.

**Off-chain:** verification requests, consent decisions, access results,
application metadata.

Privacy-sensitive interaction logs are not unnecessarily placed on a
public blockchain.

------------------------------------------------------------------------

# 🛡️ Security & Privacy

Core principles:

1.  Local biometric processing
2.  No raw biometric data on the public blockchain
3.  No unnecessary PII on-chain
4.  Consent before selective disclosure
5.  Smart-contract RBAC
6.  Backend authorization as defense-in-depth
7.  Developer applications cannot bypass the consent layer
8.  Blockchain-backed asset ownership
9.  Tamper-evident event history
10. Secrets/private keys remain in environment configuration

``` text
Minimize Data
      +
Verify Cryptographically
      +
Authorize Explicitly
      +
Audit Transparently
```

PehchanChain should not be described as "hack-proof", "100% secure", or
completely anonymous.

------------------------------------------------------------------------

# ⛓️ Smart Contracts

### `PehchanAccessControl`

Central role and permission management.

### `CredentialRegistry`

Credential/identity commitment and verification infrastructure.

### `PehchanAssetRegistry`

ERC-721 digital asset registry linked to access control and credential
infrastructure.

``` text
                 ┌─────────────────────────┐
                 │ PehchanAccessControl    │
                 │ Roles & Permissions      │
                 └────────────┬────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       ┌──────────────────┐      ┌─────────────────────┐
       │ CredentialRegistry│      │ PehchanAssetRegistry│
       │ Identity/Creds    │      │ ERC-721 Assets      │
       └──────────────────┘      └─────────────────────┘
```

------------------------------------------------------------------------

# 🌐 Blockchain Deployment

Development/testnet environment:

``` text
Network: Polygon Amoy
Chain ID: 80002
Currency: POL
```

Configuration:

``` env
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=<POLYGON_AMOY_RPC_URL>
BLOCKCHAIN_PRIVATE_KEY=<DEPLOYMENT_WALLET_PRIVATE_KEY>

ACCESS_CONTROL_ADDR=<DEPLOYED_ACCESS_CONTROL>
CREDENTIAL_REGISTRY_ADDR=<DEPLOYED_CREDENTIAL_REGISTRY>
ASSET_REGISTRY_ADDR=<DEPLOYED_ASSET_REGISTRY>
```

**Never commit private keys, seed phrases, API secrets, or
credential-bearing `.env` files.**

------------------------------------------------------------------------

# 🧪 Verification & Testing

Defensive application verification reported:

``` text
204 / 204 tests passed
0 failures
11 test suites
```

Covered areas included:

-   Biometric data handling
-   Public-chain PII exposure
-   Consent enforcement
-   Selective disclosure isolation
-   Developer authorization
-   RBAC
-   Protected contract operations
-   NFT ownership
-   Event emission
-   Input validation
-   Replay protection
-   Secret handling

Known limitation from that verification stage:

-   Verification-request TTL/expiry required further implementation.

These results are **software/defensive verification evidence**, not an
independent security certification or penetration-test certification.

------------------------------------------------------------------------

# ⚙️ Technology Stack

  -----------------------------------------------------------------------
  Layer                               Technologies
  ----------------------------------- -----------------------------------
  Frontend                            React, Vite, React Router,
                                      Tailwind/CSS

  Backend                             Node.js, Express, ethers.js v6

  Identity                            DID model, credential commitments

  Biometrics                          Browser-local processing, face-api
                                      where applicable, IndexedDB

  Cryptography                        SHA-256, HMAC/native crypto where
                                      implemented

  Blockchain                          Solidity, Hardhat, OpenZeppelin,
                                      ERC-721

  Network                             Polygon Amoy

  Development                         Git, GitHub, npm, environment
                                      configuration
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 🚀 Getting Started

## Prerequisites

-   Node.js
-   npm
-   Git
-   EVM-compatible wallet
-   Polygon Amoy test POL

## Install

``` bash
git clone <YOUR_REPOSITORY_URL>
cd Pehchan_Chain
cd backend
npm install
```

## Configure

Create `backend/.env`:

``` env
PORT=3001

BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_RPC_URL=https://polygon-amoy.drpc.org
BLOCKCHAIN_PRIVATE_KEY=YOUR_PRIVATE_KEY

ACCESS_CONTROL_ADDR=
CREDENTIAL_REGISTRY_ADDR=
ASSET_REGISTRY_ADDR=
```

## Compile

``` bash
npx hardhat compile
```

## Deploy

``` bash
node scripts/deploy-pehchan-stack.js
```

Deployment order:

``` text
PehchanAccessControl
        ↓
CredentialRegistry
        ↓
PehchanAssetRegistry
```

Add the generated addresses to `.env`.

## Verify

``` bash
node scripts/verify-amoy-deployment.js
```

## Start backend

``` bash
npm start
```

Start the frontend using the repository's configured frontend command.

------------------------------------------------------------------------

# 🧭 Demo Flow

``` text
Register Identity
      ↓
Local Biometric Enrollment
      ↓
Generate DID
      ↓
Credential / Commitment
      ↓
Admin Role Management
      ↓
Mint Digital Asset
      ↓
Assign Asset
      ↓
User Wallet
      ↓
Verifier Requests Fields
      ↓
User Consent
      ↓
Selective Disclosure
      ↓
Audit
```

------------------------------------------------------------------------

# 🏛️ Potential Government / PSU Use Cases

Potential applications include:

-   Defence project clearance credentials
-   Contractor/vendor authorization
-   Employee/partner identity verification
-   Training and certification credentials
-   Digital permits
-   Project-specific access credentials
-   Controlled digital assets
-   Inter-organizational verification
-   Tamper-evident audit trails

These are **potential use cases**, not claims of current BEL or
government deployment.

------------------------------------------------------------------------

# 📊 Problem Context

External data illustrates the scale of India's digital identity and
trust environment:

-   **17,759.21 crore** Aadhaar authentication transactions in FY
    2025--26
-   **2,457.95 crore** e-KYC transactions in FY 2025--26
-   **34,533** reported profile hacking / identity theft incidents in
    the cited 2025 NCRP category
-   **23,252** reported cheating-by-impersonation incidents in 2025
-   **36,075** reported bank fraud cases involving **₹13,930 crore** in
    FY 2023--24

These statistics provide context for the problem; they are **not claimed
as measured impact caused by PehchanChain**.

------------------------------------------------------------------------

# 💰 Economic Feasibility

The architecture emphasizes:

-   Open-source technology
-   No specialized biometric hardware for the prototype
-   Existing browser/device capabilities
-   API-first integration
-   Modular backend services
-   Usage-based infrastructure
-   Testnet-first development
-   Flexible future deployment options

Potential sustainability models:

-   Government/PSU licensing
-   Enterprise deployments
-   Verification API/SDK usage
-   Digital credential issuance
-   Managed deployment and support

Exact ROI should be established through pilot measurements rather than
assumed.

------------------------------------------------------------------------

# 🗺️ Roadmap

### Phase 1 --- Prototype

-   DID
-   Local biometric authentication
-   Consent
-   Selective disclosure
-   RBAC
-   ERC-721 assets
-   Audit
-   Polygon Amoy

### Phase 2 --- Enterprise Readiness

-   HSM integration
-   Production-grade key management
-   Institutional issuer workflows
-   Decentralized storage
-   Recovery mechanisms
-   Enterprise integrations

### Phase 3 --- Privacy & Scale

-   Zero-knowledge proofs
-   Privacy-preserving attribute verification
-   MPC / threshold recovery
-   Scalable production deployment
-   Mainnet or approved permissioned-chain integration

------------------------------------------------------------------------

# ⚠️ Current Limitations

PehchanChain is a prototype / feasibility-stage system.

Current limitations include:

-   Polygon Amoy is a testnet
-   Production key management requires further hardening
-   Verification-request TTL/expiry requires implementation
-   Production biometric security requires broader testing
-   Enterprise-scale performance requires load testing
-   Production deployment requires security review
-   Regulatory requirements depend on the deployment environment

------------------------------------------------------------------------

# 🤝 Contributing

Contributions are welcome for:

-   Security hardening
-   Smart-contract improvements
-   Identity standards
-   UI/UX
-   Test coverage
-   Developer SDKs
-   Documentation
-   Enterprise integrations

Changes involving cryptography, authentication, access control, or smart
contracts should include appropriate tests and security documentation.

------------------------------------------------------------------------

# 📄 License

Add the project's final license here before public release.

Confirm applicable institutional/SIH intellectual-property requirements
before selecting a public open-source license.

------------------------------------------------------------------------

# 👥 Project

**PehchanChain --- SIH 2026**

**Problem Statement:** SIH26125\
**Organization:** Bharat Electronics Limited (BEL)\
**Theme:** Blockchain & Cybersecurity

------------------------------------------------------------------------

## ⭐ Key Takeaway

> **PehchanChain --- Prove who you are. Share only what is required.
> Control what you own.**
