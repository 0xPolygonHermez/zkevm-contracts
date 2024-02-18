// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../lib/PolygonRollupBaseEtrog.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract PolygonZkEVMEtrogIsolatedPreEtrog is PolygonRollupBaseEtrog {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which will be used to call sequenceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param globalExitRoot Global exit root of the batch
     * @param timestamp Sequenced timestamp of the batch
     * @param minForcedTimestamp Minimum timestamp of the force batch data, empty when non forced batch
     */
    struct BatchDataLegacy {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64 minForcedTimestamp;
    }

    // Last sequenced timestamp
    uint64 public lastTimestamp;

    // View variable returning the last batch sequenced
    uint64 public lastBatchSequenced;

    // Keep track of the current sequenced batches before this rollup would be added to the rollup manager
    uint64 public accSequencedBatches;

    // chainID
    uint64 public chainID;

    // Legacy events

    /**
     * @dev Emitted when the trusted sequencer sends a new batch of transactions
     */
    event SequenceBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted everytime the forkID is updated, this includes the first initialization of the contract
     * This event is intended to be emitted for every upgrade of the contract with relevant changes for the nodes
     */
    event UpdateZkEVMVersion(uint64 numBatch, uint64 forkID, string version);

    /**
     * @dev Thrown when user is bridging tokens and is also sending a value
     */
    error NotAllowedInPreEtrog();

    // View functions needed for legacy node

    function getBatchFee() public view returns (uint256) {
        return rollupManager.getBatchFee();
    }

    function lastVerifiedBatch() public view returns (uint64) {
        return 0;
    }

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    )
        PolygonRollupBaseEtrog(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {}

    /**
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _version Version string
     */
    function initialize(
        address _admin,
        address sequencer,
        uint64 _chainID,
        string memory sequencerURL,
        string memory _networkName,
        string memory _version
    ) external initializer {
        chainID = _chainID;
        lastTimestamp = uint64(block.timestamp);

        // Set initialize variables
        admin = _admin;
        trustedSequencer = sequencer;

        trustedSequencerURL = sequencerURL;
        networkName = _networkName;

        forceBatchAddress = _admin;

        // Constant deployment variables
        forceBatchTimeout = 5 days;

        // emit version event
        emit UpdateZkEVMVersion(0, 6, _version);
    }

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which holds the necessary data to append new batches to the sequence
     * @param l2Coinbase Address that will receive the fees from L2
     * note Pol is not a reentrant token
     */
    function sequenceBatches(
        BatchDataLegacy[] calldata batches,
        address l2Coinbase
    ) public onlyTrustedSequencer {
        uint256 batchesNum = batches.length;
        if (batchesNum == 0) {
            revert SequenceZeroBatches();
        }

        if (batchesNum > _MAX_VERIFY_BATCHES) {
            revert ExceedMaxVerifyBatches();
        }

        // Update global exit root if there are new deposits
        bridgeAddress.updateGlobalExitRoot();

        // Get global batch variables
        uint64 currentTimestamp = lastTimestamp;

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = lastAccInputHash;

        // Store in a temporal variable, for avoid access again the storage slot
        uint64 initLastForceBatchSequenced = currentLastForceBatchSequenced;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchDataLegacy memory currentBatch = batches[i];

            // Store the current transactions hash since can be used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(
                currentBatch.transactions
            );

            // Check if it's a forced batch
            if (currentBatch.minForcedTimestamp > 0) {
                currentLastForceBatchSequenced++;

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

                // Check timestamp is bigger than min timestamp
                if (currentBatch.timestamp < currentBatch.minForcedTimestamp) {
                    revert SequencedTimestampBelowForcedTimestamp();
                }
            } else {
                // Check global exit root exists with proper batch length. These checks are already done in the forceBatches call
                // Note that the sequencer can skip setting a global exit root putting zeros
                if (
                    currentBatch.globalExitRoot != bytes32(0) &&
                    globalExitRootManager.globalExitRootMap(
                        currentBatch.globalExitRoot
                    ) ==
                    0
                ) {
                    revert GlobalExitRootNotExist();
                }

                if (
                    currentBatch.transactions.length >
                    _MAX_TRANSACTIONS_BYTE_LENGTH
                ) {
                    revert TransactionsLengthAboveMax();
                }
            }

            // Check Batch timestamps are correct
            if (
                currentBatch.timestamp < currentTimestamp ||
                currentBatch.timestamp > block.timestamp
            ) {
                revert SequencedTimestampInvalid();
            }

            // Calculate next accumulated input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    currentTransactionsHash,
                    currentBatch.globalExitRoot,
                    currentBatch.timestamp,
                    l2Coinbase
                )
            );

            // Update timestamp
            currentTimestamp = currentBatch.timestamp;
        }

        // Sanity check, should be unreachable
        if (currentLastForceBatchSequenced > lastForceBatch) {
            revert ForceBatchesOverflow();
        }

        // Store back the storage variables
        lastAccInputHash = currentAccInputHash;
        lastTimestamp = currentTimestamp;

        uint256 nonForcedBatchesSequenced = batchesNum;

        // Check if there has been forced batches
        if (currentLastForceBatchSequenced != initLastForceBatchSequenced) {
            uint64 forcedBatchesSequenced = currentLastForceBatchSequenced -
                initLastForceBatchSequenced;
            // substract forced batches
            nonForcedBatchesSequenced -= forcedBatchesSequenced;

            // Transfer pol for every forced batch submitted
            pol.safeTransfer(
                address(rollupManager),
                calculatePolPerForceBatch() * (forcedBatchesSequenced)
            );

            // Store new last force batch sequenced
            lastForceBatchSequenced = currentLastForceBatchSequenced;
        }

        uint64 newBatches = accSequencedBatches + uint64(batchesNum);
        (bool success, bytes memory returnData) = address(rollupManager).call(
            abi.encodeCall(
                PolygonRollupManager.onSequenceBatches,
                (newBatches, currentAccInputHash)
            )
        );

        uint64 currentBatchSequenced;

        if (success) {
            // Pay collateral for every non-forced batch submitted
            pol.safeTransferFrom(
                msg.sender,
                address(rollupManager),
                rollupManager.getBatchFee() * newBatches
            );

            // Clean acc sequenced batches
            accSequencedBatches = 0;

            // Decode total sequenced batches from polygon rollup manager
            currentBatchSequenced = abi.decode(returnData, (uint64));
        } else {
            currentBatchSequenced = newBatches;
            accSequencedBatches = currentBatchSequenced;
        }

        lastBatchSequenced = currentBatchSequenced;

        emit SequenceBatches(currentBatchSequenced);
    }

    // Dissable etrog functions

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which holds the necessary data to append new batches to the sequence
     * @param l2Coinbase Address that will receive the fees from L2
     * note Pol is not a reentrant token
     */
    function sequenceBatches(
        BatchData[] calldata batches,
        address l2Coinbase
    ) public override onlyTrustedSequencer {
        revert NotAllowedInPreEtrog();
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions.
     * This should be used only in extreme cases where the trusted sequencer does not work as expected
     * Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
     * In order to assure that users force transactions will be processed properly, user must not sign any other transaction
     * with the same nonce
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * @param polAmount Max amount of pol tokens that the sender is willing to pay
     */
    function forceBatch(
        bytes calldata transactions,
        uint256 polAmount
    ) public override {
        revert NotAllowedInPreEtrog();
    }
}
