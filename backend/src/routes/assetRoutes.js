/**
 * assetRoutes.js
 *
 * Express routes for PehchanChain digital assets.
 */

'use strict';

const express = require('express');
const assetController = require('../controllers/assetController');

const router = express.Router();

router.post('/mint', assetController.mintAsset);
router.post('/transfer', assetController.transferAsset);
router.get('/owner/:tokenId', assetController.getAssetOwner);
router.get('/identity/:did', assetController.getAssetsByIdentity);

module.exports = router;
