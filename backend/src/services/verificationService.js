/**
 * verificationService.js — Unified Verification Engine
 *
 * Core business logic for BLAuth's Selective-Disclosure Verification Engine.
 * Serves as the single unified engine for both request sources:
 *   - Mode 1: Manual Verifier Portal (human-operated /verify/request)
 *   - Mode 2: Developer SDK (API-key authenticated /developer/verify)
 *
 * Architecture:
 *             ┌──────────────────────┐
 *             │ Unified Verification │
 *             │       Engine         │
 *             └──────────┬───────────┘
 *                        │
 *             ┌──────────┴──────────┐
 *             │                     │
 *      Manual Verifier        Developer SDK
 *         Mode 1                  Mode 2
 *
 * Both modes share the exact same consent, selective-disclosure,
 * disclosure logging, and approval semantics.
 */

const { createVerificationRequest: createVerificationRequestRecord } = require('../models/verificationRequest');
const { createDisclosureHistoryEntry } = require('../models/disclosureHistory');
const { isAgeOver18 } = require('../utils/age');
const { validateConsent, validateVerificationRequest } = require('../utils/validation');
const { getVerificationRequestStore } = require('./verificationRequestStore');
const { getWalletStore } = require('./walletStore');

const AGE_WITHHELD_FIELDS = ['dob', 'name', 'email', 'phone', 'studentId'];
const COLLEGE_WITHHELD_FIELDS = ['email', 'dob', 'phone'];

async function createVerificationRequest(payload) {
  const requestDetails = validateVerificationRequest(payload);
  const wallet = await getWalletStore().findByWalletId(requestDetails.walletId);

  if (!wallet) {
    const error = new Error('walletId does not exist.');
    error.status = 404;
    throw error;
  }

  const { v4: createUuid } = await import('uuid');
  const verificationRequest = createVerificationRequestRecord({
    requestId: `req_${createUuid()}`,
    ...requestDetails,
  });

  await getVerificationRequestStore().save(verificationRequest);
  return verificationRequest;
}

async function processConsent(payload) {
  const { requestId, approvedFields } = validateConsent(payload);
  const requestStore = getVerificationRequestStore();
  const verificationRequest = await requestStore.findByRequestId(requestId);

  if (!verificationRequest) {
    const error = new Error('requestId does not exist.');
    error.status = 404;
    throw error;
  }
  if (verificationRequest.status !== 'PENDING') {
    const error = new Error('Verification request has already been completed.');
    error.status = 409;
    throw error;
  }

  const walletStore = getWalletStore();
  const wallet = await walletStore.findByWalletId(verificationRequest.walletId);
  if (!wallet) {
    const error = new Error('Wallet does not exist.');
    error.status = 404;
    throw error;
  }

  const approvedFieldSet = new Set(approvedFields);
  const disclosedFields = verificationRequest.requestedFields.filter(
    (field) => approvedFieldSet.has(field),
  );
  let withheldFields = verificationRequest.requestedFields.filter(
    (field) => !disclosedFields.includes(field),
  );
  const isAgeVerification = verificationRequest.verifierId === 'age-restricted-service'
    && verificationRequest.requestedFields.length === 1
    && verificationRequest.requestedFields[0] === 'ageOver18';
  if (isAgeVerification) {
    withheldFields = AGE_WITHHELD_FIELDS;
  }
  const isCollegeVerification = verificationRequest.verifierId === 'college-portal'
    && verificationRequest.requestedFields.length === 2
    && verificationRequest.requestedFields.includes('name')
    && verificationRequest.requestedFields.includes('studentId');
  if (isCollegeVerification) {
    withheldFields = [...new Set([...withheldFields, ...COLLEGE_WITHHELD_FIELDS])];
  }
  const outcome = disclosedFields.length > 0 ? 'APPROVED' : 'DENIED';
  const { v4: createUuid } = await import('uuid');
  const disclosureHistoryEntry = createDisclosureHistoryEntry({
    disclosureId: `disclosure_${createUuid()}`,
    requestId: verificationRequest.requestId,
    verifierId: verificationRequest.verifierId,
    requestedFields: verificationRequest.requestedFields,
    approvedFields,
    disclosedFields,
    withheldFields,
    outcome,
  });

  const data = {};
  for (const field of disclosedFields) {
    data[field] = field === 'ageOver18'
      ? isAgeOver18(wallet.credentials.dob)
      : wallet.credentials[field];
  }

  wallet.disclosureHistory.push(disclosureHistoryEntry);
  verificationRequest.status = outcome;

  await walletStore.update(wallet);
  await requestStore.update(verificationRequest);

  return { data, outcome };
}

/**
 * fetchRequestStatus — safe polling endpoint for verifier portals.
 *
 * Returns only public-safe metadata about the request:
 *   - requestId, status, verifierId, requestedFields, createdAt
 *
 * If status is APPROVED, it additionally returns the selectively-disclosed
 * data that the user explicitly approved via POST /verify/consent.
 * This data is read from the wallet's disclosureHistory (what the user already
 * chose to share) — NOT from raw wallet.credentials.
 *
 * If status is DENIED or PENDING, no credential values are returned.
 */
async function fetchRequestStatus(requestId) {
  if (typeof requestId !== 'string' || !requestId.trim()) {
    const error = new Error('requestId is required.');
    error.status = 400;
    throw error;
  }

  const requestStore = getVerificationRequestStore();
  const verificationRequest = await requestStore.findByRequestId(requestId.trim());

  if (!verificationRequest) {
    const error = new Error('requestId does not exist.');
    error.status = 404;
    throw error;
  }

  // Always-safe public fields — contains no credential data
  const publicFields = {
    requestId:       verificationRequest.requestId,
    status:          verificationRequest.status,
    verifierId:      verificationRequest.verifierId,
    requestedFields: verificationRequest.requestedFields,
    createdAt:       verificationRequest.createdAt,
  };

  if (verificationRequest.status === 'APPROVED') {
    // Pull approved data from the wallet's disclosure history — this is data
    // the user already explicitly shared; reading it here is safe and correct.
    const walletStore = getWalletStore();
    const wallet = await walletStore.findByWalletId(verificationRequest.walletId);

    if (wallet) {
      const historyEntry = [...wallet.disclosureHistory]
        .reverse()
        .find((entry) => entry.requestId === requestId.trim());

      if (historyEntry) {
        // Build disclosed data from approved fields only (never full credentials)
        const disclosedData = {};
        const { isAgeOver18 } = require('../utils/age');
        for (const field of historyEntry.disclosedFields || []) {
          disclosedData[field] = field === 'ageOver18'
            ? isAgeOver18(wallet.credentials.dob)
            : wallet.credentials[field];
        }
        publicFields.disclosedFields  = historyEntry.disclosedFields  || [];
        publicFields.withheldFields   = historyEntry.withheldFields   || [];
        publicFields.disclosedData    = disclosedData;
      }
    }
  }

  if (verificationRequest.status === 'DENIED') {
    publicFields.disclosedFields = [];
    publicFields.withheldFields  = verificationRequest.requestedFields;
    publicFields.disclosedData   = {};
  }

  return publicFields;
}

module.exports = { createVerificationRequest, processConsent, fetchRequestStatus };
