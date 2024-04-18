// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import "../PolygonZkEVM.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet environment
 */
contract PolygonZkEVMTestnetClearStorage is PolygonZkEVM {
    // Indicates the current version
    uint256 public version;

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier Rollup verifier address
     * @param _bridgeAddress Bridge address
     * @param _chainID L2 chainID
     */
    constructor(
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        IPolygonZkEVMBridge _bridgeAddress,
        uint64 _chainID,
        uint64 _forkID
    )
        PolygonZkEVM(
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            _bridgeAddress,
            _chainID,
            _forkID
        )
    {}

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    /**
     * @notice Clear previous storage
     */
    function clearStorage() public {
        forceBatchTimeout = 5 days;
        isForcedBatchDisallowed = true;
        assembly {
            sstore(version.slot, 0)
            sstore(add(version.slot, 1), 0)
            sstore(add(version.slot, 2), 0)
        }
    }
}
