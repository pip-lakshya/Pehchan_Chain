const { createVerificationRequest, processConsent, fetchRequestStatus } = require('../services/verificationService');

async function requestVerification(req, res, next) {
  try {
    const verificationRequest = await createVerificationRequest(req.body);
    res.status(201).json({ requestId: verificationRequest.requestId });
  } catch (error) {
    next(error);
  }
}

async function submitConsent(req, res, next) {
  try {
    const result = await processConsent(req.body);
    res.status(200).json({
      verified: result.outcome === 'APPROVED',
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /verify/request/:requestId
 *
 * Returns public-safe fields of a verification request so verifier portals
 * can poll for status.  Wallet credentials are NEVER returned here; only the
 * selectively-disclosed data that the user explicitly approved via
 * POST /verify/consent is included once the status is APPROVED.
 */
async function getRequestStatus(req, res, next) {
  try {
    const result = await fetchRequestStatus(req.params.requestId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { requestVerification, submitConsent, getRequestStatus };

