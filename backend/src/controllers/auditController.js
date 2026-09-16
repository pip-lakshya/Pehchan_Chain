/**
 * auditController.js
 *
 * Express controller handlers for PehchanChain Audit Trail:
 *   - GET /audit/log/:did
 */

'use strict';

const { validateDID } = require('../utils/validation');
const { getAuditLogsForDID } = require('../services/auditService');

async function getAuditLogs(req, res, next) {
  try {
    const rawDID = req.params.did;
    if (!rawDID || typeof rawDID !== 'string' || rawDID.trim() === '') {
      const err = new Error('DID parameter is required.');
      err.status = 400;
      throw err;
    }

    const logs = await getAuditLogsForDID(rawDID.trim());

    res.status(200).json({
      status: 'success',
      did: rawDID.trim(),
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAuditLogs };
