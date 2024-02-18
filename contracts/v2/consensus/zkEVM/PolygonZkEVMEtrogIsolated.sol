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
contract PolygonZkEVMEtrogIsolated is PolygonRollupBaseEtrog {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Keep track of the current sequenced batches before this rollup would be added to the rollup manager
    uint256 public sequencedBatches;

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
     * @param networkID Indicates the network identifier that will be used in the bridge
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     */
    function initialize(
        address _admin,
        address sequencer,
        uint32 networkID,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external override initializer {
        bytes memory gasTokenMetadata;

        if (_gasTokenAddress != address(0)) {
            // Ask for token metadata, the same way is enconded in the bridge
            // Note that this function will revert if the token is not in this network
            // Note that this could be a possible reentrant call, but cannot make changes on the state since are static call
            gasTokenMetadata = bridgeAddress.getTokenMetadata(_gasTokenAddress);

            // Check gas token address on the bridge
            (
                uint32 originWrappedNetwork,
                address originWrappedAddress
            ) = bridgeAddress.wrappedTokenToTokenInfo(_gasTokenAddress);

            if (originWrappedNetwork != 0) {
                // It's a wrapped token, get the wrapped parameters
                gasTokenAddress = originWrappedAddress;
                gasTokenNetwork = originWrappedNetwork;
            } else {
                // gasTokenNetwork will be mainnet, for instance 0
                gasTokenAddress = _gasTokenAddress;
            }
        }
        // Sequence transaction to initilize the bridge

        // Calculate transaction to initialize the bridge
        bytes memory transaction = generateInitializeTransaction(
            networkID,
            gasTokenAddress,
            gasTokenNetwork,
            gasTokenMetadata
        );

        bytes32 currentTransactionsHash = keccak256(transaction);

        // Get current timestamp and global exit root
        uint64 currentTimestamp = uint64(block.timestamp);
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Add the transaction to the sequence as if it was a force transaction
        bytes32 newAccInputHash = keccak256(
            abi.encodePacked(
                bytes32(0), // Current acc Input hash
                currentTransactionsHash,
                lastGlobalExitRoot, // Global exit root
                currentTimestamp,
                sequencer,
                blockhash(block.number - 1)
            )
        );

        lastAccInputHash = newAccInputHash;
        sequencedBatches = 1; // num total batches

        // Set initialize variables
        admin = _admin;
        trustedSequencer = sequencer;

        trustedSequencerURL = sequencerURL;
        networkName = _networkName;

        forceBatchAddress = _admin;

        // Constant deployment variables
        forceBatchTimeout = 5 days;

        emit InitialSequenceBatches(transaction, lastGlobalExitRoot, sequencer);
    }

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
        bytes32 l1InfoRoot = globalExitRootManager.getRoot();
        uint64 currentTimestamp = uint64(block.timestamp);

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = lastAccInputHash;

        // Store in a temporal variable, for avoid access again the storage slot
        uint64 initLastForceBatchSequenced = currentLastForceBatchSequenced;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Store the current transactions hash since can be used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(
                currentBatch.transactions
            );

            // Check if it's a forced batch
            if (currentBatch.forcedTimestamp > 0) {
                currentLastForceBatchSequenced++;

                // Check forced data matches
                bytes32 hashedForcedBatchData = keccak256(
                    abi.encodePacked(
                        currentTransactionsHash,
                        currentBatch.forcedGlobalExitRoot,
                        currentBatch.forcedTimestamp,
                        currentBatch.forcedBlockHashL1
                    )
                );

                if (
                    hashedForcedBatchData !=
                    forcedBatches[currentLastForceBatchSequenced]
                ) {
                    revert ForcedDataDoesNotMatch();
                }

                // Calculate next accumulated input hash
                currentAccInputHash = keccak256(
                    abi.encodePacked(
                        currentAccInputHash,
                        currentTransactionsHash,
                        currentBatch.forcedGlobalExitRoot,
                        currentBatch.forcedTimestamp,
                        l2Coinbase,
                        currentBatch.forcedBlockHashL1
                    )
                );

                // Delete forceBatch data since won't be used anymore
                delete forcedBatches[currentLastForceBatchSequenced];
            } else {
                // Note that forcedGlobalExitRoot and forcedBlockHashL1 remain unused and unchecked in this path
                // The synchronizer should be aware of that
                if (
                    currentBatch.transactions.length >
                    _MAX_TRANSACTIONS_BYTE_LENGTH
                ) {
                    revert TransactionsLengthAboveMax();
                }

                // Calculate next accumulated input hash
                currentAccInputHash = keccak256(
                    abi.encodePacked(
                        currentAccInputHash,
                        currentTransactionsHash,
                        l1InfoRoot,
                        currentTimestamp,
                        l2Coinbase,
                        bytes32(0)
                    )
                );
            }
        }

        // Sanity check, should be unreachable
        if (currentLastForceBatchSequenced > lastForceBatch) {
            revert ForceBatchesOverflow();
        }

        // Store back the storage variables
        lastAccInputHash = currentAccInputHash;

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

        // Pay collateral for every non-forced batch submitted
        pol.safeTransferFrom(
            msg.sender,
            address(rollupManager),
            rollupManager.getBatchFee() * nonForcedBatchesSequenced
        );

        (bool success, bytes memory returnData) = address(rollupManager).call(
            abi.encodeCall(
                PolygonRollupManager.onSequenceBatches,
                (uint64(sequencedBatches + batchesNum), currentAccInputHash)
            )
        );

        uint64 currentBatchSequenced;

        if (success) {
            sequencedBatches = 0;
            currentBatchSequenced = abi.decode(returnData, (uint64));
        } else {
            currentBatchSequenced = uint64(sequencedBatches + batchesNum);
            sequencedBatches = currentBatchSequenced;
        }

        emit SequenceBatches(currentBatchSequenced, l1InfoRoot);
    }
}
