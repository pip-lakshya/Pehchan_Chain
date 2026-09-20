const express = require('express');

const { requestVerification, submitConsent, getRequestStatus, getWalletRequests } = require('../controllers/verificationController');

const router = express.Router();

router.post('/request', requestVerification);
router.post('/consent', submitConsent);
router.get('/request/:requestId', getRequestStatus);
router.get('/wallet/:walletId', getWalletRequests);

module.exports = router;
