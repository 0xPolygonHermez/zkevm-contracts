// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../PolygonRollupManager.sol";

/**
 * PolygonRollupManager Test
 */
contract PolygonRollupManagerNotUpgraded is PolygonRollupManager {
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol MATIC token address
     * @param _bridgeAddress Bridge address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress
    ) PolygonRollupManager(_globalExitRootManager, _pol, _bridgeAddress) {}

    function initialize(
        address trustedAggregator,
        uint64 _pendingStateTimeout,
        uint64 _trustedAggregatorTimeout,
        address admin,
        address timelock,
        address emergencyCouncil,
        PolygonZkEVMExistentEtrog /*polygonZkEVM*/,
        IVerifierRollup /*zkEVMVerifier*/,
        uint64 /*zkEVMForkID*/,
        uint64 /*zkEVMChainID*/
    ) external override reinitializer(2) {
        pendingStateTimeout = _pendingStateTimeout;
        trustedAggregatorTimeout = _trustedAggregatorTimeout;

        // Constant deployment variables
        _batchFee = 0.1 ether; // 0.1 Matic
        verifyBatchTimeTarget = 30 minutes;
        multiplierBatchFee = 1002;

        // Initialize OZ contracts
        __AccessControl_init();

        // setup roles

        // trusted aggregator role
        _setupRole(_TRUSTED_AGGREGATOR_ROLE, trustedAggregator);

        // Timelock roles
        _setupRole(DEFAULT_ADMIN_ROLE, timelock);
        _setupRole(_ADD_ROLLUP_TYPE_ROLE, timelock);
        _setupRole(_ADD_EXISTING_ROLLUP_ROLE, timelock);

        // Even this role can only update to an already added verifier/consensus
        // Could break the compatibility of them, changing the virtual state
        _setupRole(_UPDATE_ROLLUP_ROLE, timelock);

        // Admin roles
        _setupRole(_OBSOLETE_ROLLUP_TYPE_ROLE, admin);
        _setupRole(_CREATE_ROLLUP_ROLE, admin);
        _setupRole(_STOP_EMERGENCY_ROLE, admin);
        _setupRole(_TWEAK_PARAMETERS_ROLE, admin);
        _setRoleAdmin(_TRUSTED_AGGREGATOR_ROLE, _TRUSTED_AGGREGATOR_ROLE_ADMIN);
        _setupRole(_TRUSTED_AGGREGATOR_ROLE_ADMIN, admin);

        _setupRole(_SET_FEE_ROLE, admin);

        // Emergency council roles
        _setRoleAdmin(_EMERGENCY_COUNCIL_ROLE, _EMERGENCY_COUNCIL_ADMIN);
        _setupRole(_EMERGENCY_COUNCIL_ROLE, emergencyCouncil);
        _setupRole(_EMERGENCY_COUNCIL_ADMIN, emergencyCouncil);
    }
}
