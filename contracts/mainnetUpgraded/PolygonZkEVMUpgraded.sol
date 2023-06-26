// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

import "../PolygonZkEVM.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet enviroment
 */
contract PolygonZkEVMUpgraded is PolygonZkEVM {
    // Indicates the current version
    uint256 public version;

    // Last batch before the last upgrade, should check it inside the _proofDifferentState function
    uint256 public lastBatchBeforeUpgrade;

    // Indicates the last version before upgrade
    uint256 public immutable VERSION_BEFORE_UPGRADE;

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
        uint64 _forkID,
        uint256 versionBeforeUpgrade
    )
        PolygonZkEVM(
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            _bridgeAddress,
            _chainID,
            _forkID
        )
    {
        VERSION_BEFORE_UPGRADE = versionBeforeUpgrade;
    }

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    /**
     * @notice Update version of the zkEVM
     * @param _versionString New version string
     */
    function updateVersion(string memory _versionString) public {
        if (version != VERSION_BEFORE_UPGRADE) {
            revert VersionAlreadyUpdated();
        }
        version++;

        lastBatchBeforeUpgrade = lastVerifiedBatch;
        emit UpdateZkEVMVersion(lastVerifiedBatch, forkID, _versionString);
    }
}
