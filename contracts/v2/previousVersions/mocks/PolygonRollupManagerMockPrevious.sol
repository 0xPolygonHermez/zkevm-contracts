// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../PolygonRollupManagerPrevious.sol";

/**
 * PolygonRollupManager mock
 */
contract PolygonRollupManagerMockPrevious is PolygonRollupManagerPrevious {
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol MATIC token address
     * @param _bridgeAddress Bridge address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress
    )
        PolygonRollupManagerPrevious(
            _globalExitRootManager,
            _pol,
            _bridgeAddress
        )
    {}

    function initializeMock(
        address trustedAggregator,
        uint64 _pendingStateTimeout,
        uint64 _trustedAggregatorTimeout,
        address admin,
        address timelock,
        address emergencyCouncil
    ) external reinitializer(2) {
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

        // Since it's mock, use admin for everything
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function prepareMockCalculateRoot(bytes32[] memory localExitRoots) public {
        rollupCount = uint32(localExitRoots.length);

        // Add local Exit roots;
        for (uint256 i = 0; i < localExitRoots.length; i++) {
            rollupIDToRollupData[uint32(i + 1)]
                .lastLocalExitRoot = localExitRoots[i];
        }
    }
}
