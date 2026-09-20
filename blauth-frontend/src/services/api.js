// Production uses the same origin through a reverse proxy. Set VITE_API_BASE_URL
// only when the API is intentionally deployed on a separate origin.
const DEFAULT_DEV_API_URL = "http://localhost:3001";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL !== undefined && import.meta.env.VITE_API_BASE_URL !== ""
    ? import.meta.env.VITE_API_BASE_URL
    : (import.meta.env.DEV ? DEFAULT_DEV_API_URL : "")
).replace(/\/$/, "");


function getErrorMessage(responseBody, status) {
  if (responseBody && typeof responseBody === "object") {
    return responseBody.message || responseBody.error || `Backend request failed (${status}).`;
  }
  return `Backend request failed (${status}).`;
}

export async function registerIdentity({ verified, credentials, biometricCommitment }) {
  const requestBody = {
    verified,
    credentials: {
      name: credentials?.name,
      studentId: credentials?.studentId,
      email: credentials?.email,
      phone: credentials?.phone,
      dob: credentials?.dob,
    },
    biometricCommitment,
  };

  const response = await fetch(`${API_BASE_URL}/identity/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody, response.status));
  }
  if (!responseBody?.walletId) {
    throw new Error("Backend registration did not return a wallet ID.");
  }

  return responseBody;
}

export async function authenticateBiometricCommitment(biometricCommitment) {
  const response = await fetch(`${API_BASE_URL}/identity/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ biometricCommitment }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody;
}

export async function getWallet(walletId) {
  if (!walletId) {
    throw new Error("A wallet ID is required.");
  }

  const response = await fetch(`${API_BASE_URL}/identity/${encodeURIComponent(walletId)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody, response.status));
  }
  if (!responseBody?.credentials) {
    throw new Error("Backend wallet response did not include identity credentials.");
  }

  return responseBody;
}

export async function getDisclosureHistory(walletId) {
  if (!walletId) {
    throw new Error("A wallet ID is required.");
  }

  const response = await fetch(`${API_BASE_URL}/identity/${encodeURIComponent(walletId)}/disclosures`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody, response.status));
  }
  if (!Array.isArray(responseBody?.disclosures)) {
    throw new Error("Backend disclosure history response is invalid.");
  }

  return responseBody.disclosures;
}

export async function createVerificationRequest({ walletId, verifierId, requestedFields }) {
  const response = await fetch(`${API_BASE_URL}/verify/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId, verifierId, requestedFields }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody, response.status));
  }
  if (!responseBody?.requestId) {
    throw new Error("Backend verification request did not return a request ID.");
  }

  return responseBody;
}

export async function createDeveloperApp({ name }) {
  const response = await fetch(`${API_BASE_URL}/developer/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  if (!responseBody?.appId || !responseBody?.apiKey || !responseBody?.apiSecret) {
    throw new Error("Backend developer application creation response is invalid.");
  }
  return responseBody;
}

export async function createDeveloperVerificationRequest({ walletId, requestedFields, apiKey, apiSecret }) {
  const response = await fetch(`${API_BASE_URL}/developer/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BLAuth-API-Key": apiKey,
      "X-BLAuth-API-Secret": apiSecret,
    },
    body: JSON.stringify({ walletId, requestedFields }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  if (!responseBody?.requestId) throw new Error("Backend developer verification did not return a request ID.");
  return responseBody;
}

export async function submitConsent({ requestId, approvedFields }) {
  const response = await fetch(`${API_BASE_URL}/verify/consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, approvedFields }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody, response.status));
  }
  if (typeof responseBody?.verified !== "boolean" || !responseBody.data || typeof responseBody.data !== "object") {
    throw new Error("Backend consent response is invalid.");
  }

  return {
    consentApproved: responseBody.verified,
    data: responseBody.data,
  };
}

export async function verifyAgeOver18(walletId) {
  const { requestId } = await createVerificationRequest({
    walletId,
    verifierId: "age-restricted-service",
    requestedFields: ["ageOver18"],
  });
  const { consentApproved, data } = await submitConsent({
    requestId,
    approvedFields: ["ageOver18"],
  });
  const disclosedFields = Object.keys(data);

  if (!consentApproved || disclosedFields.length !== 1 || disclosedFields[0] !== "ageOver18" || typeof data.ageOver18 !== "boolean") {
    throw new Error("Backend age verification did not return an age-over-18 result.");
  }

  return { requestId, ageOver18: data.ageOver18 };
}

export async function mintAsset({ requesterDID, recipient, targetDID, name, category, ipfsHash, payloadHash }) {
  const response = await fetch(`${API_BASE_URL}/asset/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterDID, recipient, targetDID, name, category, ipfsHash, payloadHash }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function transferAsset({ requesterDID, tokenId, recipient, targetDID }) {
  const response = await fetch(`${API_BASE_URL}/asset/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesterDID, tokenId, recipient, targetDID }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function getAssetOwner(tokenId) {
  const response = await fetch(`${API_BASE_URL}/asset/owner/${encodeURIComponent(tokenId)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function getAssetsByIdentity(did) {
  const response = await fetch(`${API_BASE_URL}/asset/identity/${encodeURIComponent(did)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function assignRole({ targetDID, role }) {
  const response = await fetch(`${API_BASE_URL}/role/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetDID, role }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function revokeRole({ targetDID, role }) {
  const response = await fetch(`${API_BASE_URL}/role/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetDID, role }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function getRolesForDID(did) {
  const response = await fetch(`${API_BASE_URL}/role/${encodeURIComponent(did)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

/**
 * getVerificationRequestStatus — polls GET /verify/request/:requestId.
 *
 * Returns the request's public-safe status record.
 * Wallet credentials are never exposed through this endpoint;
 * approved disclosed data is only present when status === "APPROVED"
 * (i.e. after the user has completed consent on their device).
 */
export async function getVerificationRequestStatus(requestId) {
  if (!requestId) throw new Error("A request ID is required.");
  const response = await fetch(`${API_BASE_URL}/verify/request/${encodeURIComponent(requestId)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody;
}

export async function getAuditLogsForDID(did) {
  if (!did) throw new Error("A DID is required to query audit logs.");
  const response = await fetch(`${API_BASE_URL}/audit/log/${encodeURIComponent(did)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(responseBody, response.status));
  return responseBody.data;
}

export async function getVerificationRequestsForWallet(walletId) {
  if (!walletId) return [];
  const response = await fetch(`${API_BASE_URL}/verify/wallet/${encodeURIComponent(walletId)}`);
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) return [];
  return responseBody.data || [];
}

