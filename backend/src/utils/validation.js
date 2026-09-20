class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const allowedRequestFields = new Set(['verified', 'credentials', 'biometricCommitment']);
const allowedCredentialFields = new Set(['name', 'studentId', 'email', 'phone', 'dob']);
const supportedVerificationFields = new Set(['name', 'studentId', 'email', 'phone', 'dob', 'ageOver18', 'assets', 'nft']);

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function rejectUnexpectedFields(object, allowedFields, label) {
  const unexpectedFields = Object.keys(object).filter((field) => !allowedFields.has(field));
  if (unexpectedFields.length > 0) {
    throw new ValidationError(`Unexpected ${label} field: ${unexpectedFields[0]}.`);
  }
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required.`);
  }
  return value.trim();
}

function isValidDateOfBirth(dob) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() <= todayUtc;
}

function validateBiometricCommitment(commitment) {
  if (typeof commitment !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(commitment)) {
    throw new ValidationError('biometricCommitment must be a bytes32 hexadecimal value.');
  }
  return commitment.toLowerCase();
}

function validateRegistration(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  rejectUnexpectedFields(payload, allowedRequestFields, 'request');

  if (!hasOwn(payload, 'verified')) {
    throw new ValidationError('verified is required.');
  }
  if (typeof payload.verified !== 'boolean') {
    throw new ValidationError('verified must be a boolean.');
  }
  if (!payload.verified) {
    throw new ValidationError('Local biometric verification is required.');
  }
  if (!hasOwn(payload, 'credentials') || !payload.credentials) {
    throw new ValidationError('credentials are required.');
  }
  if (typeof payload.credentials !== 'object' || Array.isArray(payload.credentials)) {
    throw new ValidationError('credentials must be an object.');
  }

  rejectUnexpectedFields(payload.credentials, allowedCredentialFields, 'credentials');

  const credentials = {
    name: requiredText(payload.credentials.name, 'name'),
    studentId: requiredText(payload.credentials.studentId, 'studentId'),
    email: requiredText(payload.credentials.email, 'email'),
    phone: requiredText(payload.credentials.phone, 'phone'),
    dob: requiredText(payload.credentials.dob, 'dob'),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) {
    throw new ValidationError('email is invalid.');
  }
  if (!/^\+?[1-9]\d{9,14}$/.test(credentials.phone)) {
    throw new ValidationError('phone is invalid.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(credentials.dob)) {
    throw new ValidationError('dob must be in YYYY-MM-DD format.');
  }
  if (!isValidDateOfBirth(credentials.dob)) {
    throw new ValidationError('dob must be a valid, non-future calendar date.');
  }

  return {
    credentials,
    biometricCommitment: hasOwn(payload, 'biometricCommitment')
      ? validateBiometricCommitment(payload.biometricCommitment)
      : null,
  };
}

function validateVerificationRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  if (typeof payload.walletId !== 'string' || payload.walletId.trim() === '') {
    throw new ValidationError('walletId is required.');
  }
  if (typeof payload.verifierId !== 'string' || payload.verifierId.trim() === '') {
    throw new ValidationError('verifierId must be a non-empty string.');
  }
  if (!hasOwn(payload, 'requestedFields')) {
    throw new ValidationError('requestedFields is required.');
  }
  if (!Array.isArray(payload.requestedFields)) {
    throw new ValidationError('requestedFields must be an array.');
  }
  if (payload.requestedFields.length === 0) {
    throw new ValidationError('requestedFields must not be empty.');
  }

  const requestedFields = payload.requestedFields.map((field) => {
    if (typeof field !== 'string' || !supportedVerificationFields.has(field)) {
      throw new ValidationError('requestedFields contains an unsupported field.');
    }
    return field;
  });

  if (new Set(requestedFields).size !== requestedFields.length) {
    throw new ValidationError('requestedFields must not contain duplicates.');
  }

  return {
    walletId: payload.walletId.trim(),
    verifierId: payload.verifierId.trim(),
    requestedFields,
  };
}

function validateConsent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.trim() === '') {
    throw new ValidationError('requestId is required.');
  }
  if (!hasOwn(payload, 'approvedFields')) {
    throw new ValidationError('approvedFields is required.');
  }
  if (!Array.isArray(payload.approvedFields)) {
    throw new ValidationError('approvedFields must be an array.');
  }

  const approvedFields = payload.approvedFields.map((field) => {
    if (typeof field !== 'string' || !supportedVerificationFields.has(field)) {
      throw new ValidationError('approvedFields contains an unsupported field.');
    }
    return field;
  });

  if (new Set(approvedFields).size !== approvedFields.length) {
    throw new ValidationError('approvedFields must not contain duplicates.');
  }

  return { requestId: payload.requestId.trim(), approvedFields };
}

function validateDeveloperApp(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }
  if (typeof payload.name !== 'string' || payload.name.trim() === '') {
    throw new ValidationError('name is required.');
  }

  return payload.name.trim();
}

function validateEthereumAddress(address, label = 'recipient') {
  if (typeof address !== 'string' || address.trim() === '') {
    throw new ValidationError(`${label} is required.`);
  }
  const clean = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    throw new ValidationError(`${label} must be a valid Ethereum address.`);
  }
  return clean;
}

function validateDID(did, label = 'targetDID') {
  if (typeof did !== 'string' || did.trim() === '') {
    throw new ValidationError(`${label} is required.`);
  }
  const clean = did.trim();
  if (!/^did:[a-z0-9]+:[a-zA-Z0-9_.:%-]+$/.test(clean)) {
    throw new ValidationError(`${label} must be a valid DID string.`);
  }
  return clean;
}

function validateTokenId(tokenId) {
  if (tokenId === undefined || tokenId === null || (typeof tokenId === 'string' && tokenId.trim() === '')) {
    throw new ValidationError('tokenId is required.');
  }
  const str = String(tokenId).trim();
  if (!/^\d+$/.test(str) || BigInt(str) < 1n) {
    throw new ValidationError('tokenId must be a positive integer.');
  }
  return str;
}

function validateMintAsset(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const recipient = validateEthereumAddress(payload.recipient, 'recipient');
  const targetDID = validateDID(payload.targetDID, 'targetDID');
  const name = requiredText(payload.name, 'name');
  const category = requiredText(payload.category, 'category');

  let requesterDID = null;
  if (hasOwn(payload, 'requesterDID') && payload.requesterDID) {
    requesterDID = validateDID(payload.requesterDID, 'requesterDID');
  }

  let ipfsHash = '';
  if (hasOwn(payload, 'ipfsHash') && payload.ipfsHash !== null && payload.ipfsHash !== undefined) {
    if (typeof payload.ipfsHash !== 'string') {
      throw new ValidationError('ipfsHash must be a string.');
    }
    ipfsHash = payload.ipfsHash.trim();
  }

  let payloadHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (hasOwn(payload, 'payloadHash') && payload.payloadHash !== null && payload.payloadHash !== undefined) {
    if (typeof payload.payloadHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(payload.payloadHash.trim())) {
      throw new ValidationError('payloadHash must be a valid 32-byte hex string (0x followed by 64 hex characters).');
    }
    payloadHash = payload.payloadHash.trim().toLowerCase();
  }

  return { requesterDID, recipient, targetDID, name, category, ipfsHash, payloadHash };
}

function validateTransferAsset(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const tokenId = validateTokenId(payload.tokenId);
  const recipient = validateEthereumAddress(payload.recipient, 'recipient');
  const targetDID = validateDID(payload.targetDID, 'targetDID');

  let requesterDID = null;
  if (hasOwn(payload, 'requesterDID') && payload.requesterDID) {
    requesterDID = validateDID(payload.requesterDID, 'requesterDID');
  }

  return { requesterDID, tokenId, recipient, targetDID };
}

const supportedRoles = new Set(['ADMIN', 'MANAGER', 'AUDITOR', 'USER']);

function validateRole(role) {
  if (typeof role !== 'string' || role.trim() === '') {
    throw new ValidationError('role is required.');
  }
  const clean = role.trim().toUpperCase();
  if (!supportedRoles.has(clean)) {
    throw new ValidationError(`Invalid role: '${role}'. Allowed roles are: ADMIN, MANAGER, AUDITOR, USER.`);
  }
  return clean;
}

function validateRolePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const targetDID = validateDID(payload.targetDID || payload.did || payload.account, 'targetDID');
  const role = validateRole(payload.role);

  return { targetDID, role };
}

module.exports = {
  ValidationError,
  validateRegistration,
  validateVerificationRequest,
  validateConsent,
  validateDeveloperApp,
  validateBiometricCommitment,
  validateEthereumAddress,
  validateDID,
  validateTokenId,
  validateMintAsset,
  validateTransferAsset,
  validateRole,
  validateRolePayload,
};
