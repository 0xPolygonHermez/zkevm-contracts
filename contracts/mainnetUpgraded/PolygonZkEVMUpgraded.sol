// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../inheritedMainContracts/PolygonZkEVM.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet enviroment
 */
contract PolygonZkEVMUpgraded is PolygonZkEVM {
    // Indicates the last version before upgrade
    uint256 public VERSION_BEFORE_UPGRADE;

    // Indicates the current version
    uint256 public version;

    // Last batch verified before the last upgrade
    uint256 public lastVerifiedBatchBeforeUpgrade;

   /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier Rollup verifier address
     * @param _bridgeAddress Bridge address
     */
    function initialize(
        InitializePackedParameters calldata initializePackedParameters,
        bytes32 genesisRoot,
        string memory _trustedSequencerURL,
        string memory _networkName,
        string calldata _version,
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        IPolygonZkEVMBridge _bridgeAddress,
        uint256 versionBeforeUpgrade
    ) public initializer {
        PolygonZkEVM.initialize(
            initializePackedParameters,
            genesisRoot,
            _trustedSequencerURL,
            _networkName,
            _version,
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            _bridgeAddress,
            0,// todo provide real value
            0// todo provide real value
        );
        VERSION_BEFORE_UPGRADE = versionBeforeUpgrade;
    }

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    /**
     * @dev Thrown when try to proof a non deterministic state using a verified batch from previous forkIDs
     */
    error InitBatchMustMatchCurrentForkID();

    /**
     * @notice Update version of the zkEVM
     * @param _versionString New version string
     */
    function updateVersion(string memory _versionString) public {
        if (version != VERSION_BEFORE_UPGRADE) {
            revert VersionAlreadyUpdated();
        }
        version++;

        lastVerifiedBatchBeforeUpgrade = lastVerifiedBatch;
        emit UpdateZkEVMVersion(lastVerifiedBatch, forkID, _versionString);
    }

    /**
     * @notice Internal function that proves a different state root given the same batches to verify
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function _proveDistinctPendingState(
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) internal view override {
        if (initNumBatch < lastVerifiedBatchBeforeUpgrade) {
            revert InitBatchMustMatchCurrentForkID();
        }

        super._proveDistinctPendingState(
            initPendingStateNum,
            finalPendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );
    }

    /**
     * @notice Verify and reward batches internal function
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function _verifyAndRewardBatches(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) internal override {
        if (initNumBatch < lastVerifiedBatchBeforeUpgrade) {
            revert InitBatchMustMatchCurrentForkID();
        }

        super._verifyAndRewardBatches(
            pendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );
    }
}
