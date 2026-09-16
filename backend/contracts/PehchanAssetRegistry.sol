// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title PehchanAssetRegistry
 * @dev ERC-721 Digital Asset Registry for PehchanChain (SIH26125).
 * Built on OpenZeppelin ERC-721 to ensure security, standard compliance,
 * unique asset identification, DID ownership indexing, and role-governed lifecycle.
 */
contract PehchanAssetRegistry is ERC721URIStorage {
    struct Asset {
        uint256 tokenId;
        string assetName;
        string assetType;
        string tokenURI;
        bytes32 didHash;
        string did;
        bytes32 dataHash;
        address mintedBy;
        uint256 mintedAt;
    }

    uint256 private _nextTokenId;
    address public admin;
    address public credentialRegistry;

    mapping(address => bool) public isManager;
    mapping(uint256 => Asset) private _assets;
    mapping(bytes32 => uint256[]) private _didTokens;
    mapping(uint256 => uint256) private _didTokenIndex;

    event AssetMinted(
        uint256 indexed tokenId,
        bytes32 indexed didHash,
        string did,
        address indexed recipient,
        string assetName,
        string assetType,
        string tokenURI,
        bytes32 dataHash,
        address mintedBy,
        uint256 timestamp
    );

    event AssetAssigned(
        uint256 indexed tokenId,
        bytes32 indexed fromDIDHash,
        bytes32 indexed toDIDHash,
        string fromDID,
        string toDID,
        address fromAddress,
        address toAddress,
        address assignedBy,
        uint256 timestamp
    );

    event ManagerAuthorized(address indexed manager, uint256 timestamp);
    event ManagerRevoked(address indexed manager, uint256 timestamp);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin, uint256 timestamp);
    event CredentialRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    modifier onlyAdmin() {
        require(msg.sender == admin, "PehchanAssetRegistry: caller is not admin");
        _;
    }

    modifier onlyAdminOrManager() {
        require(
            msg.sender == admin || isManager[msg.sender],
            "PehchanAssetRegistry: caller is not admin or manager"
        );
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address initialAdmin,
        address _credentialRegistry
    ) ERC721(name, symbol) {
        admin = initialAdmin == address(0) ? msg.sender : initialAdmin;
        credentialRegistry = _credentialRegistry;
    }

    /**
     * @notice Authorize or revoke a Manager address.
     * @param manager The manager address to configure.
     * @param authorized True to authorize, false to revoke.
     */
    function setManager(address manager, bool authorized) external onlyAdmin {
        require(manager != address(0), "PehchanAssetRegistry: invalid manager address");
        isManager[manager] = authorized;

        if (authorized) {
            emit ManagerAuthorized(manager, block.timestamp);
        } else {
            emit ManagerRevoked(manager, block.timestamp);
        }
    }

    /**
     * @notice Transfer admin authority to a new address.
     * @param newAdmin The address of the new administrator.
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "PehchanAssetRegistry: invalid admin address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin, block.timestamp);
    }

    /**
     * @notice Optionally update the associated BLAuth CredentialRegistry address.
     * @param newRegistry Address of the CredentialRegistry contract.
     */
    function setCredentialRegistry(address newRegistry) external onlyAdmin {
        address oldRegistry = credentialRegistry;
        credentialRegistry = newRegistry;
        emit CredentialRegistryUpdated(oldRegistry, newRegistry);
    }

    /**
     * @notice Mint a new digital asset NFT linked to a target DID.
     * @dev Only authorized Admin functionality may mint assets.
     * @param recipient The wallet address receiving the token.
     * @param did The decentralized identifier string (e.g. "did:pehchan:wallet_123").
     * @param assetName Human-readable asset name (e.g. "Verified Contributor Credential").
     * @param assetType Type category (e.g. "CREDENTIAL", "CLEARANCE", "LICENSE").
     * @param uri URI pointing to asset metadata.
     * @param dataHash Cryptographic hash commitment of the document/payload.
     * @return tokenId The ID of the newly minted token.
     */
    function mintAsset(
        address recipient,
        string calldata did,
        string calldata assetName,
        string calldata assetType,
        string calldata uri,
        bytes32 dataHash
    ) external onlyAdmin returns (uint256) {
        require(recipient != address(0), "PehchanAssetRegistry: recipient cannot be zero address");
        require(bytes(did).length > 0, "PehchanAssetRegistry: DID cannot be empty");
        require(bytes(assetName).length > 0, "PehchanAssetRegistry: assetName cannot be empty");

        uint256 tokenId = ++_nextTokenId;
        bytes32 didHash = keccak256(bytes(did));

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);

        _assets[tokenId] = Asset({
            tokenId: tokenId,
            assetName: assetName,
            assetType: assetType,
            tokenURI: uri,
            didHash: didHash,
            did: did,
            dataHash: dataHash,
            mintedBy: msg.sender,
            mintedAt: block.timestamp
        });

        _didTokens[didHash].push(tokenId);
        _didTokenIndex[tokenId] = _didTokens[didHash].length - 1;

        emit AssetMinted(
            tokenId,
            didHash,
            did,
            recipient,
            assetName,
            assetType,
            uri,
            dataHash,
            msg.sender,
            block.timestamp
        );

        return tokenId;
    }

    /**
     * @notice Assign or transfer an existing digital asset to a new owner DID.
     * @dev Authorized Manager or Admin functionality can allocate/transfer assets.
     * @param tokenId The ID of the asset token to assign.
     * @param newOwner The new recipient wallet address.
     * @param newDid The new recipient's decentralized identifier string.
     */
    function assignAsset(
        uint256 tokenId,
        address newOwner,
        string calldata newDid
    ) external onlyAdminOrManager {
        address currentOwner = _ownerOf(tokenId);
        require(currentOwner != address(0), "PehchanAssetRegistry: token does not exist");
        require(newOwner != address(0), "PehchanAssetRegistry: newOwner cannot be zero address");
        require(bytes(newDid).length > 0, "PehchanAssetRegistry: newDid cannot be empty");

        Asset storage asset = _assets[tokenId];
        string memory oldDid = asset.did;
        bytes32 oldDidHash = asset.didHash;
        bytes32 newDidHash = keccak256(bytes(newDid));

        // Remove token from old DID list using swap-and-pop
        uint256 indexToRemove = _didTokenIndex[tokenId];
        uint256 lastIndex = _didTokens[oldDidHash].length - 1;
        if (indexToRemove != lastIndex) {
            uint256 lastTokenId = _didTokens[oldDidHash][lastIndex];
            _didTokens[oldDidHash][indexToRemove] = lastTokenId;
            _didTokenIndex[lastTokenId] = indexToRemove;
        }
        _didTokens[oldDidHash].pop();

        // Update asset state
        asset.did = newDid;
        asset.didHash = newDidHash;

        // Add token to new DID list
        _didTokens[newDidHash].push(tokenId);
        _didTokenIndex[tokenId] = _didTokens[newDidHash].length - 1;

        // Perform OpenZeppelin ERC-721 transfer
        _update(newOwner, tokenId, address(0));

        emit AssetAssigned(
            tokenId,
            oldDidHash,
            newDidHash,
            oldDid,
            newDid,
            currentOwner,
            newOwner,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Retrieve full metadata for a digital asset.
     */
    function getAsset(uint256 tokenId) external view returns (Asset memory) {
        require(_ownerOf(tokenId) != address(0), "PehchanAssetRegistry: token does not exist");
        return _assets[tokenId];
    }

    /**
     * @notice Retrieve owner address and DID for a digital asset.
     */
    function getAssetOwner(uint256 tokenId)
        external
        view
        returns (address ownerAddress, string memory did, bytes32 didHash)
    {
        ownerAddress = ownerOf(tokenId);
        Asset memory asset = _assets[tokenId];
        return (ownerAddress, asset.did, asset.didHash);
    }

    /**
     * @notice Query all token IDs associated with a specific DID string.
     */
    function getAssetsByDID(string calldata did) external view returns (uint256[] memory) {
        bytes32 didHash = keccak256(bytes(did));
        return _didTokens[didHash];
    }

    /**
     * @notice Query all token IDs associated with a specific DID hash.
     */
    function getAssetsByDIDHash(bytes32 didHash) external view returns (uint256[] memory) {
        return _didTokens[didHash];
    }

    /**
     * @notice Total count of assets minted so far.
     */
    function totalAssets() external view returns (uint256) {
        return _nextTokenId;
    }
}
