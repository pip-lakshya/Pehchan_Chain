/**
 * roleRoutes.js
 *
 * Express routes for PehchanChain Role-Based Access Control (RBAC).
 */

'use strict';

const express = require('express');
const roleController = require('../controllers/roleController');

const router = express.Router();

router.post('/assign', roleController.assignRole);
router.post('/revoke', roleController.revokeRole);
router.get('/:did', roleController.getRolesByDID);

module.exports = router;
