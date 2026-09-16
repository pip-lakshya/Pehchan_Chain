// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PehchanAccessControl} from "./PehchanAccessControl.sol";

/**
 * @title CredentialRegistry
 * @dev On-chain credential hash registry for PehchanChain / BLAuth.
 *
 * All permission checks are delegated to a shared PehchanAccessControl hub:
 *   - registerCredential()  → requires USER_ROLE
 *   - revokeCredential()    → USER_ROLE (own credential) or ADMIN_ROLE (any)
 *   - verifyCredential()    → requires AUDITOR_ROLE
 *
 * Read-only functions (getCredential, isCredentialRegistered) remain
 * permissionless so that any contract or off-chain client can query status.
 */
contract CredentialRegistry {
    struct Credential {
        address walletAddress;
        uint256 registeredAt;
        bool revoked;
        bool exists;
    }

    PehchanAccessControl public immutable accessControl;

    mapping(bytes32 => Credential) private credentials;

    event CredentialRegistered(bytes32 indexed credentialHash, address indexed walletAddress, uint256 registeredAt);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed revokedBy, uint256 revokedAt);
    event CredentialVerified(bytes32 indexed credentialHash, address indexed verifiedBy, uint256 timestamp);

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyUser() {
        require(
            accessControl.isUser(msg.sender),
            "CredentialRegistry: caller does not have USER_ROLE"
        );
        _;
    }

    modifier onlyAuditor() {
        require(
            accessControl.isAuditor(msg.sender),
            "CredentialRegistry: caller does not have AUDITOR_ROLE"
        );
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _accessControl Address of the deployed PehchanAccessControl hub.
     */
    constructor(address _accessControl) {
        require(_accessControl != address(0), "CredentialRegistry: zero access control");
        accessControl = PehchanAccessControl(_accessControl);
    }

    // -----------------------------------------------------------------------
    // State-changing functions
    // -----------------------------------------------------------------------

    /**
     * @notice Register a credential hash on chain.
     * @dev Requires USER_ROLE. The credential is bound to msg.sender.
     * @param credentialHash The keccak256 hash of the credential payload.
     */
    function registerCredential(bytes32 credentialHash) external onlyUser {
        require(!credentials[credentialHash].exists, "Credential already registered");

        credentials[credentialHash] = Credential({
            walletAddress: msg.sender,
            registeredAt: block.timestamp,
            revoked: false,
            exists: true
        });

        emit CredentialRegistered(credentialHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Revoke a previously registered credential.
     * @dev USER_ROLE holders can revoke their own credentials.
     *      ADMIN_ROLE holders can revoke any credential.
     * @param credentialHash The hash of the credential to revoke.
     */
    function revokeCredential(bytes32 credentialHash) external {
        Credential storage credential = credentials[credentialHash];
        require(credential.exists, "Credential not registered");
        require(!credential.revoked, "Credential already revoked");

        bool isOwner = credential.walletAddress == msg.sender && accessControl.isUser(msg.sender);
        bool isAdmin = accessControl.isAdmin(msg.sender);
        require(
            isOwner || isAdmin,
            "CredentialRegistry: caller cannot revoke this credential"
        );

        credential.revoked = true;
        emit CredentialRevoked(credentialHash, msg.sender, block.timestamp);
    }

    // -----------------------------------------------------------------------
    // Auditor-gated verification
    // -----------------------------------------------------------------------

    /**
     * @notice Verify a credential's on-chain status.
     * @dev Requires AUDITOR_ROLE. Emits CredentialVerified for audit trail.
     * @param credentialHash The hash of the credential to verify.
     * @return walletAddress The address that registered the credential.
     * @return registeredAt Timestamp of registration.
     * @return revoked Whether the credential has been revoked.
     */
    function verifyCredential(bytes32 credentialHash)
        external
        onlyAuditor
        returns (address walletAddress, uint256 registeredAt, bool revoked)
    {
        Credential memory credential = credentials[credentialHash];
        require(credential.exists, "Credential not registered");

        emit CredentialVerified(credentialHash, msg.sender, block.timestamp);
        return (credential.walletAddress, credential.registeredAt, credential.revoked);
    }

    // -----------------------------------------------------------------------
    // Permissionless read-only queries
    // -----------------------------------------------------------------------

    /**
     * @notice Get credential details (permissionless read).
     */
    function getCredential(bytes32 credentialHash)
        external
        view
        returns (address walletAddress, uint256 registeredAt, bool revoked)
    {
        Credential memory credential = credentials[credentialHash];
        require(credential.exists, "Credential not registered");
        return (credential.walletAddress, credential.registeredAt, credential.revoked);
    }

    /**
     * @notice Check if a credential hash has been registered (permissionless read).
     */
    function isCredentialRegistered(bytes32 credentialHash) external view returns (bool) {
        return credentials[credentialHash].exists;
    }
}
