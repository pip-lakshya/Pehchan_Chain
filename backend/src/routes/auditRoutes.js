/**
 * auditRoutes.js
 *
 * Express routes for PehchanChain Audit Trail.
 */

'use strict';

const express = require('express');
const { getAuditLogs } = require('../controllers/auditController');

const router = express.Router();

router.get('/log/:did', getAuditLogs);

module.exports = router;
