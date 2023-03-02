// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

import "../PolygonZkEVM.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet enviroment
 */
contract PolygonZkEVMTestnetV2 is PolygonZkEVM {
    // Define if forced batches will be allowed
    // Defined as a uint256 because it will be easy to updgrade afterwards
    uint256 public forcedBatchesAllowed;

    // Define if the force batch timeout
    // Defined as a uint256 because it will be easy to updgrade afterwards
    uint256 public forceBatchTimeout;

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
     * @dev Thrown when force batch is not allowed
     */
    error ForceBatchNowAllowed();

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    modifier isForceBatchAllowed() {
        if (forcedBatchesAllowed != 0) {
            revert ForceBatchNowAllowed();
        }
        _;
    }

    // Override methods
    function forceBatch(
        bytes calldata transactions,
        uint256 maticAmount
    ) public override isForceBatchAllowed {
        super.forceBatch(transactions, maticAmount);
    }

    function sequenceForceBatches(
        ForcedBatchData[] calldata batches
    ) external override isForceBatchAllowed ifNotEmergencyState {
        uint256 batchesNum = batches.length;

        if (batchesNum == 0) {
            revert SequenceZeroBatches();
        }

        if (batchesNum > _MAX_VERIFY_BATCHES) {
            revert ExceedMaxVerifyBatches();
        }

        if (
            uint256(lastForceBatchSequenced) + batchesNum >
            uint256(lastForceBatch)
        ) {
            revert ForceBatchesOverflow();
        }

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = sequencedBatches[currentBatchSequenced]
            .accInputHash;

        // Sequence force batches
        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            ForcedBatchData memory currentBatch = batches[i];
            currentLastForceBatchSequenced++;

            // Store the current transactions hash since it's used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(
                currentBatch.transactions
            );

            // Check forced data matches
            bytes32 hashedForcedBatchData = keccak256(
                abi.encodePacked(
                    currentTransactionsHash,
                    currentBatch.globalExitRoot,
                    currentBatch.minForcedTimestamp
                )
            );

            if (
                hashedForcedBatchData !=
                forcedBatches[currentLastForceBatchSequenced]
            ) {
                revert ForcedDataDoesNotMatch();
            }

            // Delete forceBatch data since won't be used anymore
            delete forcedBatches[currentLastForceBatchSequenced];

            if (i == (batchesNum - 1)) {
                // The last batch will have the most restrictive timestamp
                if (
                    currentBatch.minForcedTimestamp + getForceBatchTimeout() >
                    block.timestamp
                ) {
                    revert ForceBatchTimeoutNotExpired();
                }
            }
            // Calculate next acc input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    currentTransactionsHash,
                    currentBatch.globalExitRoot,
                    uint64(block.timestamp),
                    msg.sender
                )
            );
        }
        // Update currentBatchSequenced
        currentBatchSequenced += uint64(batchesNum);

        lastTimestamp = uint64(block.timestamp);

        // Store back the storage variables
        sequencedBatches[currentBatchSequenced] = SequencedBatchData({
            accInputHash: currentAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: lastBatchSequenced
        });
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequenceForceBatches(currentBatchSequenced);
    }

    function getForceBatchTimeout() public view returns (uint64) {
        if (forceBatchTimeout == 0) {
            return _FORCE_BATCH_TIMEOUT;
        } else {
            return uint64(forceBatchTimeout);
        }
    }

    /**
     * @notice Set new forcedBatchTimeout
     * @param newforceBatchTimeout new forced batches timeout
     */
    function setForceBatchTimeout(
        uint64 newforceBatchTimeout
    ) public onlyOwner {
        forceBatchTimeout = newforceBatchTimeout;
    }

    /**
     * @notice Set new forced batches allowed
     * Defined as a uint256 because it will be easy to updgrade afterwards
     * @param newForcedBatchesAllowed new forced batches allowed
     */
    function setForcedBatchesAllowed(
        uint256 newForcedBatchesAllowed
    ) public onlyOwner {
        forcedBatchesAllowed = newForcedBatchesAllowed;
    }

    // V2 testnet functions
    /**
     * @notice Set network name
     * @param _networkName New verifier
     */
    function setNetworkName(string memory _networkName) public onlyOwner {
        networkName = _networkName;
    }

    /**
     * @notice Update version of the zkEVM
     * @param _versionString New version string
     */
    function updateVersion(string memory _versionString) public {
        if (version != 0) {
            revert VersionAlreadyUpdated();
        }
        version++;

        emit UpdateZkEVMVersion(lastVerifiedBatch, forkID, _versionString);
    }
}
