/**
 * roleController.js
 *
 * Controller handlers for PehchanChain RBAC API routes:
 *   - POST /role/assign
 *   - POST /role/revoke
 *   - GET /role/:did
 */

'use strict';

const { validateRolePayload, validateDID } = require('../utils/validation');
const rbacService = require('../services/rbacService');

async function assignRole(req, res, next) {
  try {
    const validated = validateRolePayload(req.body);
    const result = await rbacService.assignRole(validated);

    res.status(200).json({
      status: 'success',
      message: 'Role assigned successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function revokeRole(req, res, next) {
  try {
    const validated = validateRolePayload(req.body);
    const result = await rbacService.revokeRole(validated);

    res.status(200).json({
      status: 'success',
      message: 'Role revoked successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getRolesByDID(req, res, next) {
  try {
    const did = validateDID(req.params.did, 'did');
    const result = await rbacService.getRolesForDID(did);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assignRole,
  revokeRole,
  getRolesByDID,
};
