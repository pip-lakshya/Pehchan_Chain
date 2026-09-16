const express = require('express');

const { requestVerification, submitConsent, getRequestStatus } = require('../controllers/verificationController');

const router = express.Router();

router.post('/request', requestVerification);
router.post('/consent', submitConsent);
router.get('/request/:requestId', getRequestStatus);

module.exports = router;
