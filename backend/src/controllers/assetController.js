/**
 * assetController.js
 *
 * Controller handlers for PehchanChain digital asset API routes:
 *   - POST /asset/mint
 *   - POST /asset/transfer
 *   - GET /asset/owner/:tokenId
 *   - GET /asset/identity/:did
 */

'use strict';

const {
  validateMintAsset,
  validateTransferAsset,
  validateTokenId,
  validateDID,
} = require('../utils/validation');

const assetService = require('../services/assetService');

async function mintAsset(req, res, next) {
  try {
    const validated = validateMintAsset(req.body);
    const result = await assetService.mintAsset(validated);

    res.status(201).json({
      status: 'success',
      message: 'Asset minted successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function transferAsset(req, res, next) {
  try {
    const validated = validateTransferAsset(req.body);
    const result = await assetService.transferAsset(validated);

    res.status(200).json({
      status: 'success',
      message: 'Asset transferred successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getAssetOwner(req, res, next) {
  try {
    const tokenId = validateTokenId(req.params.tokenId);
    const result = await assetService.getAssetOwner(tokenId);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getAssetsByIdentity(req, res, next) {
  try {
    const did = validateDID(req.params.did, 'did');
    const result = await assetService.getAssetsByIdentity(did);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  mintAsset,
  transferAsset,
  getAssetOwner,
  getAssetsByIdentity,
};
