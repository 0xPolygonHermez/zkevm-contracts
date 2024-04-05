// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;

import "../../../lib/PolygonRollupBaseFeijoa.sol";
import "../../../interfaces/IDataAvailabilityProtocol.sol";
import "../../../interfaces/IPolygonValidium.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 * It is advised to use timelocks for the admin address in case of Validium since if can change the dataAvailabilityProtocol
 */
contract PolygonValidiumFeijoa is PolygonRollupBaseFeijoa, IPolygonValidium {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which will be used to call sequenceBatches
     * @param transactionsHash keccak256 hash of the L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param forcedGlobalExitRoot Global exit root, empty when sequencing a non forced batch
     * @param forcedTimestamp Minimum timestamp of the force batch data, empty when sequencing a non forced batch
     * @param forcedBlockHashL1 blockHash snapshot of the force batch data, empty when sequencing a non forced batch
     */
    struct ValidiumBatchData {
        bytes32 transactionsHash;
        bytes32 forcedGlobalExitRoot;
        uint64 forcedTimestamp;
        bytes32 forcedBlockHashL1;
    }

    // Data Availability Protocol Address
    IDataAvailabilityProtocol public dataAvailabilityProtocol;

    // Indicates if sequence with data avialability is allowed
    // This allow the sequencer to post the data and skip the Data comittee
    bool public isSequenceWithDataAvailabilityAllowed;

    /**
     * @dev Emitted when the admin updates the data availability protocol
     */
    event SetDataAvailabilityProtocol(address newDataAvailabilityProtocol);

    /**
     * @dev Emitted when switch the ability to sequence with data availability
     */
    event SwitchSequenceWithDataAvailability();

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
        PolygonRollupBaseFeijoa(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {}

    /////////////////////////////////////
    // Sequence/Verify batches functions
    ////////////////////////////////////
    /**
     * @notice Allows a sequencer to send multiple blobs
     * @param blobs Struct array which holds the necessary data to append new blobs to the sequence
     * @param l2Coinbase Address that will receive the fees from L2
     * @param dataAvailabilityMessage Byte array containing the signatures and all the addresses of the committee in ascending order
     * [signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
     * note that each ECDSA signatures are used, therefore each one must be 65 bytes
     * note Pol is not a reentrant token
     */
    function sequenceBlobsValidium(
        BlobData[] calldata blobs,
        address l2Coinbase,
        bytes calldata dataAvailabilityMessage
    ) public virtual onlyTrustedSequencer {
        uint256 blobsNum = blobs.length;
        if (blobsNum == 0) {
            revert SequenceZeroBlobs();
        }

        // Update global exit root if there are new deposits
        bridgeAddress.updateGlobalExitRoot();

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentLastForceBlobSequenced = lastForceBlobSequenced;
        bytes32 currentAccInputHash = lastAccInputHash;

        // Store in a temporal variable, for avoid access again the storage slot
        uint64 initLastForceBlobSequenced = currentLastForceBlobSequenced;

        uint256 accZkGasSequenced;

        for (uint256 i = 0; i < blobsNum; i++) {
            BlobData calldata currentBlob = blobs[i];

            // Check max sequence timestamp inside of range

            // Supported types: 0 calldata, 1 blob transaction, 2 forced
            if (currentBlob.blobType > 2) {
                revert BlobTypeNotSupported();
            }

            if (currentBlob.blobType == CALLDATA_BLOB_TYPE) {
                // Validium

                // avoid stack to deep for some reason
                address coinbase = l2Coinbase;

                // Decode calldata transaction parameters
                (
                    uint64 maxSequenceTimestamp,
                    uint64 zkGasLimit,
                    uint32 l1InfoLeafIndex,
                    bytes32 transactionsHash
                ) = abi.decode(
                        currentBlob.blobTypeParams,
                        (uint64, uint64, uint32, bytes32)
                    );

                if (
                    uint256(maxSequenceTimestamp) >
                    (block.timestamp + TIMESTAMP_RANGE)
                ) {
                    revert MaxTimestampSequenceInvalid();
                }

                bytes32 l1InfoLeafHash;

                if (l1InfoLeafIndex != 0) {
                    l1InfoLeafHash = globalExitRootManager.l1InfoLeafMap(
                        l1InfoLeafIndex
                    );

                    if (l1InfoLeafHash == bytes32(0)) {
                        revert Invalidl1InfoLeafIndex();
                    }
                }

                // Calculate next accumulated input hash
                currentAccInputHash = keccak256(
                    abi.encodePacked(
                        currentAccInputHash,
                        l1InfoLeafIndex,
                        l1InfoLeafHash,
                        maxSequenceTimestamp,
                        coinbase,
                        zkGasLimit,
                        currentBlob.blobType,
                        bytes32(0),
                        bytes32(0),
                        transactionsHash,
                        bytes32(0)
                    )
                );

                accZkGasSequenced += zkGasLimit;
            } else if (currentBlob.blobType == BLOBTX_BLOB_TYPE) {
                // blob transaction

                // avoid stack to deep for some reason
                address coinbase = l2Coinbase;

                // Decode blob transaction parameters
                (
                    uint64 maxSequenceTimestamp,
                    uint64 zkGasLimit,
                    uint32 l1InfoLeafIndex,
                    uint256 blobIndex,
                    bytes32 z,
                    bytes32 y,
                    bytes memory commitmentAndProof
                ) = abi.decode(
                        currentBlob.blobTypeParams,
                        (
                            uint64,
                            uint64,
                            uint32,
                            uint256,
                            bytes32,
                            bytes32,
                            bytes
                        )
                    );

                if (
                    uint256(maxSequenceTimestamp) >
                    (block.timestamp + TIMESTAMP_RANGE)
                ) {
                    revert MaxTimestampSequenceInvalid();
                }

                bytes32 l1InfoLeafHash;
                if (l1InfoLeafIndex != 0) {
                    l1InfoLeafHash = globalExitRootManager.l1InfoLeafMap(
                        l1InfoLeafIndex
                    );

                    if (l1InfoLeafHash == bytes32(0)) {
                        revert Invalidl1InfoLeafIndex();
                    }
                }

                if (commitmentAndProof.length == 96) {
                    revert InvalidCommitmentAndProofLength();
                }

                {
                    bytes32 versionedHash = blobhash(blobIndex);
                    if (versionedHash == bytes32(0)) {
                        revert BlobHashNotFound();
                    }

                    (bool success, ) = POINT_EVALUATION_PRECOMPILE_ADDRESS
                        .staticcall(
                            abi.encodePacked(
                                versionedHash,
                                z,
                                y,
                                commitmentAndProof
                            )
                        );

                    if (!success) {
                        revert PointEvalutionPrecompiledFail();
                    }
                }

                // Calculate next accumulated input hash
                currentAccInputHash = keccak256(
                    abi.encodePacked(
                        currentAccInputHash,
                        l1InfoLeafIndex,
                        l1InfoLeafHash,
                        maxSequenceTimestamp,
                        coinbase,
                        zkGasLimit,
                        currentBlob.blobType,
                        z,
                        y,
                        bytes32(0), // blobL2HashData
                        bytes32(0) // forcedHashData
                    )
                );

                accZkGasSequenced += zkGasLimit;
            } else {
                // force transaction

                // avoid stack to deep for some reason
                address coinbase = l2Coinbase;

                // Decode forced parameters
                (bytes32 transactionsHash, bytes32 forcedHashData) = abi.decode(
                    currentBlob.blobTypeParams,
                    (bytes32, bytes32)
                );

                currentLastForceBlobSequenced++;

                // Check forced data matches
                bytes32 hashedForcedBlobData = keccak256(
                    abi.encodePacked(transactionsHash, forcedHashData)
                );

                if (
                    hashedForcedBlobData !=
                    forcedBlobs[currentLastForceBlobSequenced]
                        .hashedForcedBlobData
                ) {
                    revert ForcedDataDoesNotMatch();
                }

                // Delete forceBlob data since won't be used anymore
                delete forcedBlobs[currentLastForceBlobSequenced];

                // Calculate next accumulated input hash
                currentAccInputHash = keccak256(
                    abi.encodePacked(
                        currentAccInputHash,
                        uint32(0), // l1InfoLeafIndex
                        bytes32(0), // l1InfoLeafHash
                        MAX_SEQUENCE_TIMESTAMP_FORCED,
                        coinbase,
                        ZK_GAS_LIMIT_BATCH,
                        currentBlob.blobType,
                        bytes32(0),
                        bytes32(0),
                        transactionsHash,
                        forcedHashData
                    )
                );
            }
        }

        // Sanity check, should be unreachable
        if (currentLastForceBlobSequenced > lastForceBlob) {
            revert ForceBlobsOverflow();
        }

        // Store back the storage variables
        lastAccInputHash = currentAccInputHash;

        uint256 forcedZkGasLimit;

        // Check if there has been forced blobs
        if (currentLastForceBlobSequenced != initLastForceBlobSequenced) {
            uint64 forcedBlobsSequenced = currentLastForceBlobSequenced -
                initLastForceBlobSequenced;

            // Transfer pol for every forced blob submitted
            forcedZkGasLimit = forcedBlobsSequenced * ZK_GAS_LIMIT_BATCH;

            pol.safeTransfer(
                address(rollupManager),
                calculatePolPerForcedZkGas() * (forcedZkGasLimit)
            );

            // Store new last force blob sequenced
            lastForceBlobSequenced = currentLastForceBlobSequenced;
        }

        uint256 totalZkGasSequenced = accZkGasSequenced + forcedZkGasLimit;
        // Pay collateral for every non-forced blob submitted
        pol.safeTransferFrom(
            msg.sender,
            address(rollupManager),
            rollupManager.getZkGasPrice() * totalZkGasSequenced
        );

        uint64 currentBlobSequenced = rollupManager.onSequence(
            uint128(totalZkGasSequenced),
            uint64(blobsNum),
            currentAccInputHash
        );

        // TODO caveat: the commitee must sign the forced batches as well
        dataAvailabilityProtocol.verifyMessage(
            currentAccInputHash,
            dataAvailabilityMessage
        );

        emit SequenceBlobs(currentBlobSequenced);
    }

    /**
     * @notice Allows a sequencer to send multiple blobs
     * @param blobs Struct array which holds the necessary data to append new blobs to the sequence
     * @param finalAccInputHash This parameter must match the current last blob sequenced.
     * This will be a protection for the sequencer to avoid sending undesired data
     * @param l2Coinbase Address that will receive the fees from L2
     * note Pol is not a reentrant token
     */
    function sequenceBlobs(
        BlobData[] calldata blobs,
        address l2Coinbase,
        bytes32 finalAccInputHash
    ) public override {
        if (!isSequenceWithDataAvailabilityAllowed) {
            revert SequenceWithDataAvailabilityNotAllowed();
        }
        super.sequenceBlobs(blobs, l2Coinbase, finalAccInputHash);
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new data availability protocol
     * @param newDataAvailabilityProtocol Address of the new data availability protocol
     */
    function setDataAvailabilityProtocol(
        IDataAvailabilityProtocol newDataAvailabilityProtocol
    ) external onlyAdmin {
        dataAvailabilityProtocol = newDataAvailabilityProtocol;

        emit SetDataAvailabilityProtocol(address(newDataAvailabilityProtocol));
    }

    /**
     * @notice Allow the admin to switch the sequence with data availability
     * @param newIsSequenceWithDataAvailabilityAllowed Boolean to switch
     */
    function switchSequenceWithDataAvailability(
        bool newIsSequenceWithDataAvailabilityAllowed
    ) external onlyAdmin {
        if (
            newIsSequenceWithDataAvailabilityAllowed ==
            isSequenceWithDataAvailabilityAllowed
        ) {
            revert SwitchToSameValue();
        }
        isSequenceWithDataAvailabilityAllowed = newIsSequenceWithDataAvailabilityAllowed;
        emit SwitchSequenceWithDataAvailability();
    }
}
