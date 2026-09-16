// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PehchanAccessControl
 * @dev Centralized role-based access control hub for the PehchanChain ecosystem.
 *
 * Extends OpenZeppelin AccessControl to define four application-level roles:
 *
 *   DEFAULT_ADMIN_ROLE  (0x00)  — super-admin, can grant/revoke ADMIN_ROLE
 *   ADMIN_ROLE                  — can grant/revoke MANAGER, AUDITOR, USER roles;
 *                                 can mint assets; can revoke any credential
 *   MANAGER_ROLE                — can assign/transfer assets; cannot mint
 *   AUDITOR_ROLE                — can verify credentials (read-gated)
 *   USER_ROLE                   — owns wallet, registers credentials, controls consent
 *
 * Role hierarchy (admin-of relationships):
 *   DEFAULT_ADMIN_ROLE  →  admin-of  →  ADMIN_ROLE
 *   ADMIN_ROLE          →  admin-of  →  MANAGER_ROLE, AUDITOR_ROLE, USER_ROLE
 *
 * Other contracts (PehchanAssetRegistry, CredentialRegistry) reference this
 * hub via `hasRole()` to enforce permissions at the smart-contract level.
 */
contract PehchanAccessControl is AccessControl {
    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant USER_ROLE    = keccak256("USER_ROLE");

    /// @notice Emitted when a PehchanChain role is assigned.
    event PehchanRoleAssigned(
        address indexed account,
        bytes32 indexed role,
        address indexed grantedBy
    );

    /// @notice Emitted when a PehchanChain role is revoked.
    event PehchanRoleRevoked(
        address indexed account,
        bytes32 indexed role,
        address indexed revokedBy
    );

    /**
     * @param initialSuperAdmin The address that receives DEFAULT_ADMIN_ROLE.
     *        Typically the deployer or a multisig.
     */
    constructor(address initialSuperAdmin) {
        require(initialSuperAdmin != address(0), "PehchanAccessControl: zero address");

        // DEFAULT_ADMIN_ROLE is its own admin by default (OZ convention).
        // Grant it to the deployer/multisig.
        _grantRole(DEFAULT_ADMIN_ROLE, initialSuperAdmin);

        // ADMIN_ROLE is administered by DEFAULT_ADMIN_ROLE (already the
        // default, but we set it explicitly for clarity).
        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);

        // MANAGER, AUDITOR, USER roles are administered by ADMIN_ROLE.
        _setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(USER_ROLE, ADMIN_ROLE);
    }

    // -----------------------------------------------------------------------
    // Overrides to emit Pehchan-specific events alongside OZ defaults
    // -----------------------------------------------------------------------

    /// @inheritdoc AccessControl
    function _grantRole(bytes32 role, address account) internal virtual override returns (bool) {
        bool granted = super._grantRole(role, account);
        if (granted) {
            emit PehchanRoleAssigned(account, role, _msgSender());
        }
        return granted;
    }

    /// @inheritdoc AccessControl
    function _revokeRole(bytes32 role, address account) internal virtual override returns (bool) {
        bool revoked = super._revokeRole(role, account);
        if (revoked) {
            emit PehchanRoleRevoked(account, role, _msgSender());
        }
        return revoked;
    }

    // -----------------------------------------------------------------------
    // Convenience view helpers
    // -----------------------------------------------------------------------

    /// @notice Returns true if `account` holds ADMIN_ROLE.
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /// @notice Returns true if `account` holds MANAGER_ROLE.
    function isManager(address account) external view returns (bool) {
        return hasRole(MANAGER_ROLE, account);
    }

    /// @notice Returns true if `account` holds AUDITOR_ROLE.
    function isAuditor(address account) external view returns (bool) {
        return hasRole(AUDITOR_ROLE, account);
    }

    /// @notice Returns true if `account` holds USER_ROLE.
    function isUser(address account) external view returns (bool) {
        return hasRole(USER_ROLE, account);
    }
}
