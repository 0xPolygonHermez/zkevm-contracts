// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IGlobalExitRootManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IBridge.sol";
import "./lib/EmergencyManager.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue
 * THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
 * The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network
 * To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks
 */
contract ProofOfEfficiency is
    Initializable,
    OwnableUpgradeable,
    EmergencyManager
{
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
    struct BatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64 minForcedTimestamp;
    }

    /**
     * @notice Struct which will be used to call sequenceForceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param globalExitRoot Global exit root of the batch
     * @param minForcedTimestamp Indicates the minimum sequenced timestamp of the batch
     */
    struct ForcedBatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 minForcedTimestamp;
    }

    /**
     * @notice Struct which will stored for every batch sequence
     * @param accInputHash Hash chain that contains all the information to process a batch:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     */
    struct SequencedBatchData {
        bytes32 accInputHash;
        uint64 sequencedTimestamp;
        uint64 previousLastBatchSequenced;
    }

    /**
     * @notice Struct which will be used to call sequenceForceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param globalExitRoot Global exit root of the batch
     * @param minForcedTimestamp Indicates the minimum sequenced timestamp of the batch
     */
    struct PendingState {
        uint64 timestamp;
        uint64 lastVerifiedBatch;
        bytes32 exitRoot;
        bytes32 stateRoot;
    }

    /**
     * @notice Struct to call initialize, this basically saves gas becasue pack the parameters that can be packed
     * and avoid stack too deep errors.
     * @param admin  admin address
     * @param chainID L2 chainID
     * @param trustedSequencer trusted sequencer address
     * @param forceBatchAllowed indicates wheather the force batch functionality is available
     * @param trustedAggregator trusted aggregator
     * @param trustedAggregatorTimeout trusted aggregator timeou
     */
    struct InitializePackedParameters {
        address admin;
        uint64 chainID;
        address trustedSequencer;
        uint64 pendingStateTimeout;
        bool forceBatchAllowed;
        address trustedAggregator;
        uint64 trustedAggregatorTimeout;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Max batch byte length
    // Max keccaks circuit = (2**23 / 158418) * 9 = 2376
    // Bytes per keccak = 136
    // Minimum Static keccaks batch = 2
    // Max bytes allowed = (2376 - 2) * 136 = 322864 bytes - 1 byte padding
    // Rounded to 300000 bytes
    uint256 public constant MAX_BATCH_LENGTH = 300000;

    // Force batch timeout
    uint64 public constant FORCE_BATCH_TIMEOUT = 7 days;

    // Byte length of the sha256 that will be used as a input of the snark
    // SHA256(oldStateRoot, newStateRoot, oldAccInputHash, newAccInputHash, newLocalExitRoot, oldNumBatch, newNumBatch, chainID, aggrAddress)
    // 8 Fields * 8 Bytes (Stark input in Field Array form) * 5 (hashes), + 8 bytes * 3 (oldNumBatch, newNumBatch, chainID) + 20 bytes (aggrAddress)
    uint256 internal constant _SNARK_SHA_BYTES = 364;

    // If the time that a batch remains sequenced exceeds this timeout, the contract enters in emergency mode
    uint64 public constant HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Maximum batches that can be verified in one call TODO depends on our current metrics
    // This should be a protection against someone that trys to generate huge chunk of invalid batches, and we can't prove otherwise before the pending timeout expires
    uint64 public constant MAX_VERIFY_BATCHES = 1000;

    // Time target of the verification of a batch.
    // Adaptatly the batchFee will be updated to achieve this target
    uint64 public constant VERIFY_BATCH_TIME_TARGET = 30 minutes;

    // Batch fee multiplier with 1 decimal (1.1)
    uint256 public constant MULTIPLIER_BATCH_FEE = 11;

    // MATIC token address
    IERC20Upgradeable public matic;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 globalExitRoot, unint64 minTimestamp)
    mapping(uint64 => bytes32) public forcedBatches;

    // Queue of batches that defines the virtual state
    // SequenceBatchNum --> SequencedBatchData
    mapping(uint64 => SequencedBatchData) public sequencedBatches;

    // Storage Slot //

    // Last sequenced timestamp
    uint64 public lastTimestamp;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last forced batch
    uint64 public lastForceBatch;

    // Storage Slot //

    // Last batch verified by the aggregators
    uint64 public lastVerifiedBatch;

    // Trusted sequencer address
    address public trustedSequencer;

    // Storage Slot //

    // Trusted aggregator address
    address public trustedAggregator;

    // Storage Slot //

    // Rollup verifier interface
    IVerifierRollup public rollupVerifier;

    // Global Exit Root interface
    IGlobalExitRootManager public globalExitRootManager;

    // Indicates whether the force batch functionality is available
    bool public forceBatchAllowed;

    // L2 chain identifier
    uint64 public chainID;

    // State root mapping
    // BatchNum --> state root
    mapping(uint64 => bytes32) public batchNumToStateRoot;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Bridge Address
    IBridge public bridgeAddress;

    // Pending state, once the pendingStateTimeout has passed, the pending state becomes consolidated
    // pendingStateNumber --> PendingState
    mapping(uint256 => PendingState) public pendingStateTransitions;

    // Last pending state
    uint64 public lastPendingState;

    // Pending state timeout
    uint64 public lastPendingStateConsolidated;

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public pendingStateTimeout;

    // Trusted aggregator timeout, if a batch is not aggregated in this time frame,
    // everyone can aggregate that batch
    uint64 public trustedAggregatorTimeout;

    // Address that will be able to adjust contract parameters or stop the emergency state
    address public admin;

    // Current matic fee per batch sequenced
    uint256 public batchFee;

    /**
     * @dev Emitted when the trusted sequencer sends a new batch of transactions
     */
    event SequenceBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a batch is forced
     */
    event ForceBatch(
        uint64 indexed forceBatchNum,
        bytes32 lastGlobalExitRoot,
        address sequencer,
        bytes transactions
    );

    /**
     * @dev Emitted when forced batches are sequenced by not the trusted sequencer
     */
    event SequenceForceBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a aggregator verifies batches
     */
    event VerifyBatches(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when the trusted aggregator verifies batches
     */
    event TrustedVerifyBatches(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when pending state is consolidated
     */
    event ConsolidatePendingState(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when the admin update the trusted sequencer address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when the admin update the forcebatch boolean
     */
    event SetForceBatchAllowed(bool newForceBatchAllowed);

    /**
     * @dev Emitted when the admin update the seequencer URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @dev Emitted when the admin update the trusted aggregator timeout
     */
    event SetTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout);

    /**
     * @dev Emitted when the admin update the pending state timeout
     */
    event SetPendingStateTimeout(uint64 newPendingStateTimeout);

    /**
     * @dev Emitted when the admin update the trusted aggregator address
     */
    event SetTrustedAggregator(address newTrustedAggregator);

    /**
     * @dev Emitted when a admin update his address
     */
    event SetAdmin(address newAdmin);

    /**
     * @dev Emitted when is proved a different state given the same batches
     */
    event ProveNonDeterministicPendingState(
        bytes32 storedStateRoot,
        bytes32 provedStateRoot
    );

    /**
     * @dev Emitted when the trusted aggregator overrides pending state
     */
    event OverridePendingState(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param _bridgeAddress bridge address
     * @param initializePackedParameters Struct to save gas and avoid stack too depp errors
     * @param genesisRoot rollup genesis root
     * @param _trustedSequencerURL trusted sequencer URL
     * @param _networkName L2 network name
     */
    function initialize(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        IBridge _bridgeAddress,
        InitializePackedParameters calldata initializePackedParameters,
        bytes32 genesisRoot,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) public initializer {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        bridgeAddress = _bridgeAddress;
        admin = initializePackedParameters.admin;
        trustedSequencer = initializePackedParameters.trustedSequencer;
        trustedAggregator = initializePackedParameters.trustedAggregator;
        batchNumToStateRoot[0] = genesisRoot;
        trustedAggregatorTimeout = initializePackedParameters
            .trustedAggregatorTimeout;
        chainID = initializePackedParameters.chainID;
        pendingStateTimeout = initializePackedParameters.pendingStateTimeout;
        forceBatchAllowed = initializePackedParameters.forceBatchAllowed;
        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;

        // Initialize OZ contracts
        __Ownable_init_unchained();
    }

    modifier onlyAdmin() {
        require(
            admin == msg.sender,
            "ProofOfEfficiency::onlyAdmin: only admin"
        );
        _;
    }

    modifier onlyTrustedSequencer() {
        require(
            trustedSequencer == msg.sender,
            "ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer"
        );
        _;
    }

    modifier onlyTrustedAggregator() {
        require(
            trustedAggregator == msg.sender,
            "ProofOfEfficiency::onlyTrustedAggregator: only trusted Aggregator"
        );
        _;
    }

    modifier isForceBatchAllowed() {
        require(
            forceBatchAllowed == true,
            "ProofOfEfficiency::isForceBatchAllowed: only if force batch is available"
        );
        _;
    }

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which the necessary data to append new batces ot the sequence
     */
    function sequenceBatches(
        BatchData[] memory batches
    ) public ifNotEmergencyState onlyTrustedSequencer {
        uint256 batchesNum = batches.length;
        require(
            batchesNum > 0,
            "ProofOfEfficiency::sequenceBatches: At least must sequence 1 batch"
        );

        require(
            batchesNum < MAX_VERIFY_BATCHES,
            "ProofOfEfficiency::verifyBatches: cannot verify that many batches"
        );

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = sequencedBatches[currentBatchSequenced]
            .accInputHash;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Check if it's a forced batch
            if (currentBatch.minForcedTimestamp > 0) {
                currentLastForceBatchSequenced++;

                // Check forced data matches
                bytes32 hashedForcedBatchData = keccak256(
                    abi.encodePacked(
                        keccak256(currentBatch.transactions),
                        currentBatch.globalExitRoot,
                        currentBatch.minForcedTimestamp
                    )
                );

                require(
                    hashedForcedBatchData ==
                        forcedBatches[currentLastForceBatchSequenced],
                    "ProofOfEfficiency::sequenceBatches: Forced batches data must match"
                );

                // Check timestamp is bigger than min timestamp
                require(
                    currentBatch.timestamp >= currentBatch.minForcedTimestamp,
                    "ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be bigger or equal than min"
                );
            } else {
                // Check global exit root exist, and proper batch length, this checks are already done in the force Batches call
                require(
                    currentBatch.globalExitRoot == bytes32(0) ||
                        globalExitRootManager.globalExitRootMap(
                            currentBatch.globalExitRoot
                        ) !=
                        0,
                    "ProofOfEfficiency::sequenceBatches: Global exit root must exist"
                );

                require(
                    currentBatch.transactions.length < MAX_BATCH_LENGTH,
                    "ProofOfEfficiePendingStatecy::sequenceBatches: Transactions bytes overflow"
                );
            }

            // Check Batch timestamps are correct
            require(
                currentBatch.timestamp >= currentTimestamp &&
                    currentBatch.timestamp <= block.timestamp,
                "ProofOfEfficiency::sequenceBatches: Timestamp must be inside range"
            );

            // Calculate next acc input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    currentBatch.timestamp,
                    msg.sender
                )
            );

            // Update currentBatchSequenced
            currentBatchSequenced++;

            // Update timestamp
            currentTimestamp = currentBatch.timestamp;
        }

        // Sanity check, should be unreachable
        require(
            currentLastForceBatchSequenced <= lastForceBatch,
            "ProofOfEfficiency::sequenceBatches: Force batches overflow"
        );

        uint256 nonForcedBatchesSequenced = batchesNum -
            (currentLastForceBatchSequenced - lastForceBatchSequenced);

        // Store back the storage variables
        sequencedBatches[currentBatchSequenced] = SequencedBatchData({
            accInputHash: currentAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: lastBatchSequenced
        });
        lastTimestamp = currentTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        // Pay collateral for every batch submitted
        // should submit max matic to pay TODO
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            calculateBatchFee() * nonForcedBatchesSequenced
        );

        // Consolidate pending state if possible
        _consolidateNextPendingState();

        emit SequenceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatches(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public ifNotEmergencyState {
        // Check if the trusted aggregator timeout expired
        require(
            sequencedBatches[finalNewBatch].sequencedTimestamp +
                trustedAggregatorTimeout <=
                block.timestamp,
            "ProofOfEfficiency::verifyBatches: trusted aggregator timeout not expired"
        );

        require(
            finalNewBatch - initNumBatch < MAX_VERIFY_BATCHES,
            "ProofOfEfficiency::verifyBatches: cannot verify that many batches"
        );

        _verifyBatches(
            pendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proofA,
            proofB,
            proofC
        );

        // Update batch fees
        _updateBatchFee(finalNewBatch);

        if (pendingStateTimeout == 0) {
            // Consolidate state
            lastVerifiedBatch = finalNewBatch;
            batchNumToStateRoot[finalNewBatch] = newStateRoot;

            // Clean pending state if any
            if (lastPendingState > 0) {
                lastPendingState = 0;
                lastPendingStateConsolidated = 0;
            }

            // Interact with globalExitRootManager
            globalExitRootManager.updateExitRoot(newLocalExitRoot);
        } else {
            // Consolidate pending state if possible
            _consolidateNextPendingState();

            // Update pending state
            lastPendingState++;
            pendingStateTransitions[lastPendingState] = PendingState({
                timestamp: uint64(block.timestamp),
                lastVerifiedBatch: finalNewBatch,
                exitRoot: newLocalExitRoot,
                stateRoot: newStateRoot
            });
        }

        emit VerifyBatches(finalNewBatch, newStateRoot, msg.sender);
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param pendingStateNum Init pending state, 0 when consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function trustedVerifyBatches(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public onlyTrustedAggregator {
        _verifyBatches(
            pendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proofA,
            proofB,
            proofC
        );

        // Consolidate state
        lastVerifiedBatch = finalNewBatch;
        batchNumToStateRoot[finalNewBatch] = newStateRoot;

        // Clean pending state if any
        if (lastPendingState > 0) {
            lastPendingState = 0;
            lastPendingStateConsolidated = 0;
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(newLocalExitRoot);

        emit TrustedVerifyBatches(finalNewBatch, newStateRoot, msg.sender);
    }

    /**
     * @notice Verify batches internal function
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function _verifyBatches(
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) internal {
        bytes32 oldStateRoot;
        uint64 currentLastVerifiedBatch = getLastVerifiedBatch();

        // Use pending state if specified, otherwise use consolidated state
        if (pendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            require(
                pendingStateNum <= lastPendingState,
                "ProofOfEfficiency::verifyBatches: pendingStateNum must be less or equal than lastPendingState"
            );

            // Check choosen pending state
            PendingState storage currentPendingState = pendingStateTransitions[
                pendingStateNum
            ];

            // Get oldStateRoot from pending batch
            oldStateRoot = currentPendingState.stateRoot;

            // Check initNumBatch matches the pending state
            require(
                initNumBatch == currentPendingState.lastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must match the pending state batch"
            );
        } else {
            // Use consolidated state
            oldStateRoot = batchNumToStateRoot[initNumBatch];
            require(
                oldStateRoot != bytes32(0),
                "ProofOfEfficiency::verifyBatches: initNumBatch state root does not exist"
            );

            // Check initNumBatch is inside the range
            require(
                initNumBatch <= currentLastVerifiedBatch,
                "ProofOfEfficiency::verifyBatches: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
        }

        // Check final batch
        require(
            finalNewBatch > currentLastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: finalNewBatch must be bigger than currentLastVerifiedBatch"
        );

        // Get snark bytes
        bytes memory snarkHashBytes = getInputSnarkBytes(
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [inputSnark]),
            "ProofOfEfficiency::verifyBatches: INVALID_PROOF"
        );

        // Get MATIC reward
        matic.safeTransfer(
            msg.sender,
            calculateRewardPerBatch() *
                (finalNewBatch - currentLastVerifiedBatch)
        );
    }

    /**
     * @notice Internal function to consolidate the state automatically once sequence or verify batches are called
     * It trys to consolidatethe first and the middle pending state
     */
    function _consolidateNextPendingState() internal {
        // Check if there's any state to consolidate
        if (lastPendingState > lastPendingStateConsolidated) {
            // Check if it's possible to consolidate the next pending state
            uint64 nextPendingState = lastPendingStateConsolidated + 1;
            if (isPendingStateConsolidable(nextPendingState)) {
                // Check middle pending state ( binary search of 1 step)
                uint64 middlePendingState = nextPendingState +
                    (lastPendingState - nextPendingState) /
                    2;

                // Try to consolidate it, and if not, consolidate the nextPendingState
                if (isPendingStateConsolidable(middlePendingState)) {
                    consolidatePendingState(middlePendingState);
                } else {
                    consolidatePendingState(nextPendingState);
                }
            }
        }
    }

    /**
     * @notice Allows to consolidate any pending state that has already exceed the pendingStateTimeout
     * Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions
     * @param pendingStateNum Pending state to consolidate
     */
    function consolidatePendingState(uint64 pendingStateNum) public {
        // Check if pendingStateNum is in correct range
        // Not 0, is not consolidated, and exist
        require(
            pendingStateNum != 0 &&
                pendingStateNum > lastPendingStateConsolidated &&
                pendingStateNum <= lastPendingState,
            "ProofOfEfficiency::consolidatePendingState: pendingStateNum must invalid"
        );

        // Check if pending state can be consolidated
        // If trusted aggregator is the sender, do not check the timeout
        if (msg.sender != trustedAggregator) {
            require(
                isPendingStateConsolidable(pendingStateNum),
                "ProofOfEfficiency::consolidatePendingState: pending state is not ready to be consolidated"
            );
        }

        PendingState storage currentPendingState = pendingStateTransitions[
            pendingStateNum
        ];

        // Update state
        uint64 newLastVerifiedBatch = currentPendingState.lastVerifiedBatch;
        lastVerifiedBatch = newLastVerifiedBatch;
        batchNumToStateRoot[newLastVerifiedBatch] = currentPendingState
            .stateRoot;

        // Update pending state
        lastPendingStateConsolidated = pendingStateNum;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(currentPendingState.exitRoot);

        emit ConsolidatePendingState(
            newLastVerifiedBatch,
            currentPendingState.stateRoot,
            msg.sender
        );
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions.
     * This should be used only in extreme cases where the trusted sequencer does not work as expected
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(
        bytes memory transactions,
        uint256 maticAmount
    ) public ifNotEmergencyState isForceBatchAllowed {
        // Calculate matic collateral
        uint256 maticFee = calculateBatchFee();

        require(
            maticFee <= maticAmount,
            "ProofOfEfficiency::forceBatch: not enough matic"
        );

        require(
            transactions.length < MAX_BATCH_LENGTH,
            "ProofOfEfficiency::forceBatch: Transactions bytes overflow"
        );

        matic.safeTransferFrom(msg.sender, address(this), maticFee);

        // Get globalExitRoot global exit root
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Update forcedBatches mapping
        lastForceBatch++;

        forcedBatches[lastForceBatch] = keccak256(
            abi.encodePacked(
                keccak256(transactions),
                lastGlobalExitRoot,
                uint64(block.timestamp)
            )
        );

        // In order to avoid synch attacks, if the msg.sender is not the origin
        // Add the transaction bytes in the event
        if (msg.sender == tx.origin) {
            emit ForceBatch(lastForceBatch, lastGlobalExitRoot, msg.sender, "");
        } else {
            emit ForceBatch(
                lastForceBatch,
                lastGlobalExitRoot,
                msg.sender,
                transactions
            );
        }
    }

    /**
     * @notice Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period
     * @param batches Struct array which the necessary data to append new batces ot the sequence
     */
    function sequenceForceBatches(
        ForcedBatchData[] memory batches
    ) public ifNotEmergencyState isForceBatchAllowed {
        uint256 batchesNum = batches.length;

        require(
            batchesNum > 0,
            "ProofOfEfficiency::sequenceForceBatch: Must force at least 1 batch"
        );

        require(
            batchesNum < MAX_VERIFY_BATCHES,
            "ProofOfEfficiency::verifyBatches: cannot verify that many batches"
        );

        require(
            lastForceBatchSequenced + batchesNum <= lastForceBatch,
            "ProofOfEfficiency::sequenceForceBatch: Force batch invalid"
        );

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

            // Check forced data matches
            bytes32 hashedForcedBatchData = keccak256(
                abi.encodePacked(
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    currentBatch.minForcedTimestamp
                )
            );

            require(
                hashedForcedBatchData ==
                    forcedBatches[currentLastForceBatchSequenced],
                "ProofOfEfficiency::sequenceForceBatches: Forced batches data must match"
            );

            if (i == (batchesNum - 1)) {
                // The last batch will have the most restrictive timestamp
                require(
                    currentBatch.minForcedTimestamp + FORCE_BATCH_TIMEOUT <=
                        block.timestamp,
                    "ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period"
                );
            }
            // Calculate next acc input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    uint64(block.timestamp),
                    msg.sender
                )
            );

            // Update currentBatchSequenced
            currentBatchSequenced++;
        }

        lastTimestamp = uint64(block.timestamp);

        // Store back the storage variables

        sequencedBatches[currentBatchSequenced] = SequencedBatchData({
            accInputHash: currentAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: lastBatchSequenced
        });
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequenceForceBatches(lastBatchSequenced);
    }

    // admin functions

    /**
     * @notice Allow the current trusted sequencer to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequuencer
     */
    function setTrustedSequencer(address newTrustedSequencer) public onlyAdmin {
        trustedSequencer = newTrustedSequencer;

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the current trusted sequencer to allow/disallow the forceBatch functionality
     * @param newForceBatchAllowed Whether is allowed or not the forceBatch functionality
     */
    function setForceBatchAllowed(bool newForceBatchAllowed) public onlyAdmin {
        forceBatchAllowed = newForceBatchAllowed;

        emit SetForceBatchAllowed(newForceBatchAllowed);
    }

    /**
     * @notice Allow the trusted sequencer to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(
        string memory newTrustedSequencerURL
    ) public onlyAdmin {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
    }

    /**
     * @notice Allow the current trusted aggregator to set a new trusted aggregator address
     * If address 0 is set, everyone is free to aggregate
     * @param newTrustedAggregator Address of the new trusted aggregator
     */
    function setTrustedAggregator(
        address newTrustedAggregator
    ) public onlyAdmin {
        trustedAggregator = newTrustedAggregator;

        emit SetTrustedAggregator(newTrustedAggregator);
    }

    /**
     * @notice Allow the current trusted aggregator to set a new trusted aggregator timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newTrustedAggregatorTimeout Trusted aggreagator timeout
     */
    function setTrustedAggregatorTimeout(
        uint64 newTrustedAggregatorTimeout
    ) public onlyAdmin {
        require(
            newTrustedAggregatorTimeout <= HALT_AGGREGATION_TIMEOUT,
            "ProofOfEfficiency::setPendingStateTimeout: exceed halt aggregation timeout"
        );
        if (!isEmergencyState) {
            require(
                newTrustedAggregatorTimeout < trustedAggregatorTimeout,
                "ProofOfEfficiency::setTrustedAggregatorTimeout: new timeout must be lower"
            );
        }

        trustedAggregatorTimeout = newTrustedAggregatorTimeout;
        emit SetTrustedAggregatorTimeout(trustedAggregatorTimeout);
    }

    /**
     * @notice Allow the current trusted aggregator to set a new trusted aggregator timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newPendingStateTimeout Trusted aggreagator timeout
     */
    function setPendingStateTimeout(
        uint64 newPendingStateTimeout
    ) public onlyAdmin {
        require(
            pendingStateTimeout <= HALT_AGGREGATION_TIMEOUT,
            "ProofOfEfficiency::setPendingStateTimeout: exceed halt aggregation timeout"
        );
        if (!isEmergencyState) {
            require(
                newPendingStateTimeout < pendingStateTimeout,
                "ProofOfEfficiency::setPendingStateTimeout: new timeout must be lower"
            );
        }

        pendingStateTimeout = newPendingStateTimeout;
        emit SetPendingStateTimeout(newPendingStateTimeout);
    }

    /**
     * @notice Allow the current admin to set a new admin address
     * @param newAdmin Address of the new admin
     */
    function setAdmin(address newAdmin) public onlyAdmin {
        admin = newAdmin;

        emit SetAdmin(newAdmin);
    }

    // Soundness protection mechanisms

    /**
     * @notice Allows to halt the PoE if its possible to prove a different state root given the same batches
     * @param initPendingStateNum Init pending state, 0 when consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function overridePendingState(
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public onlyTrustedAggregator {
        _proveDistinctPendingState(
            initPendingStateNum,
            finalPendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proofA,
            proofB,
            proofC
        );

        // Consolidate state state
        lastVerifiedBatch = finalNewBatch;
        batchNumToStateRoot[finalNewBatch] = newStateRoot;

        // Clean pending state if any
        if (lastPendingState > 0) {
            lastPendingState = 0;
            lastPendingStateConsolidated = 0;
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(newLocalExitRoot);

        // Update trusted aggregator timeout to max
        trustedAggregatorTimeout = HALT_AGGREGATION_TIMEOUT;

        emit OverridePendingState(finalNewBatch, newStateRoot, msg.sender);
    }

    /**
     * @notice Allows to halt the PoE if its possible to prove a different state root given the same batches
     * @param initPendingStateNum Init pending state, 0 when consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function proveNonDeterministicPendingState(
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public ifNotEmergencyState {
        _proveDistinctPendingState(
            initPendingStateNum,
            finalPendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proofA,
            proofB,
            proofC
        );

        emit ProveNonDeterministicPendingState(
            batchNumToStateRoot[finalNewBatch],
            newStateRoot
        );

        // Activate emergency state
        _activateEmergencyState();
    }

    /**
     * @notice Internal functoin that prove a different state root given the same batches to verify
     * @param initPendingStateNum Init pending state, 0 when consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function _proveDistinctPendingState(
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) internal view {
        bytes32 oldStateRoot;

        // Use pending state if specified, otherwise use consolidated state
        if (initPendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            require(
                initPendingStateNum <= lastPendingState,
                "ProofOfEfficiency::proveNonDeterministicPendingState: pendingStateNum must be less or equal than lastPendingState"
            );

            // Check choosen pending state
            PendingState storage initPendingState = pendingStateTransitions[
                initPendingStateNum
            ];

            // Get oldStateRoot from init pending state
            oldStateRoot = initPendingState.stateRoot;

            // Check initNumBatch matches the init pending state
            require(
                initNumBatch == initPendingState.lastVerifiedBatch,
                "ProofOfEfficiency::proveNonDeterministicPendingState: initNumBatch must match the pending state batch"
            );
        } else {
            // Use consolidated state
            oldStateRoot = batchNumToStateRoot[initNumBatch];
            require(
                oldStateRoot != bytes32(0),
                "ProofOfEfficiency::proveNonDeterministicPendingState: initNumBatch state root does not exist"
            );

            // Check initNumBatch is inside the range
            require(
                initNumBatch <= lastVerifiedBatch,
                "ProofOfEfficiency::proveNonDeterministicPendingState: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
        }

        // Assert final pending state num is in correct range
        // Exist, is bigger than the initPendingstate, and it's not consolidated
        require(
            finalPendingStateNum <= lastPendingState &&
                finalPendingStateNum > initPendingStateNum &&
                finalPendingStateNum > lastPendingStateConsolidated,
            "ProofOfEfficiency::proveNonDeterministicPendingState: finalNewBatch must be bigger than currentLastVerifiedBatch"
        );

        // Check final num batch
        require(
            finalNewBatch ==
                pendingStateTransitions[finalPendingStateNum].lastVerifiedBatch,
            "ProofOfEfficiency::proveNonDeterministicPendingState: finalNewBatch must be bigger than currentLastVerifiedBatch"
        );

        // Get snark bytes
        bytes memory snarkHashBytes = getInputSnarkBytes(
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [inputSnark]),
            "ProofOfEfficiency::proveNonDeterministicPendingState: INVALID_PROOF"
        );

        require(
            pendingStateTransitions[finalPendingStateNum].stateRoot !=
                newStateRoot,
            "ProofOfEfficiency::proveNonDeterministicPendingState: stored root must be different than new state root"
        );
    }

    /**
     * @notice Function to activate emergency state, which also enable the emergency mode on both PoE and Bridge contrats
     * If not called by the owner owner must be provided a batcnNum that does not have been aggregated in a HALT_AGGREGATION_TIMEOUT period
     * @param sequencedBatchNum Sequenced batch number that has not been aggreagated in HALT_AGGREGATION_TIMEOUT
     */
    function activateEmergencyState(uint64 sequencedBatchNum) external {
        if (msg.sender != owner()) {
            // Only check conditions if is not called by the owner
            uint256 lastVerifiedBatchToCompare;
            if (lastPendingState > 0) {
                lastVerifiedBatchToCompare = pendingStateTransitions[
                    lastPendingState
                ].lastVerifiedBatch;
            } else {
                lastVerifiedBatchToCompare = lastVerifiedBatch;
            }
            // Check that the batch has not been verified
            require(
                sequencedBatchNum > lastVerifiedBatchToCompare,
                "ProofOfEfficiency::activateEmergencyState: Batch already verified"
            );

            // Check that has been passed HALT_AGGREGATION_TIMEOUT since it was sequenced
            require(
                sequencedBatches[sequencedBatchNum].sequencedTimestamp +
                    HALT_AGGREGATION_TIMEOUT <=
                    block.timestamp,
                "ProofOfEfficiency::activateEmergencyState: aggregation halt timeout is not expired"
            );
        }
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both PoE and Bridge contrats
     */
    function deactivateEmergencyState() external ifEmergencyState onlyAdmin {
        // Deactivate emergency state on bridge
        bridgeAddress.deactivateEmergencyState();

        // Deactivate emergency state on this contract
        super._deactivateEmergencyState();
    }

    /**
     * @notice Function to update the batch fee based on the new verfied batches
     * The batch fee will not be updated when the trusted aggregator verify batches
     */
    function _updateBatchFee(uint64 newLastVerifiedBatch) internal {
        uint64 currentLastVerifiedBatch = getLastVerifiedBatch();
        uint64 currentBatch = newLastVerifiedBatch;

        uint256 totalBatchesAboveTarget;
        uint256 newBatchesVerified = newLastVerifiedBatch -
            currentLastVerifiedBatch;

        while (currentBatch != currentLastVerifiedBatch) {
            // Load sequenced batchdata
            SequencedBatchData
                storage currentSequencedBatchData = sequencedBatches[
                    currentLastVerifiedBatch
                ];

            // Check if timestamp is above or below the VERIFY_BATCH_TIME_TARGET
            if (
                block.timestamp - currentSequencedBatchData.sequencedTimestamp >
                VERIFY_BATCH_TIME_TARGET
            ) {
                totalBatchesAboveTarget +=
                    currentLastVerifiedBatch -
                    currentSequencedBatchData.previousLastBatchSequenced;
            }

            // update currentLastVerifiedBatch
            currentBatch = currentSequencedBatchData.previousLastBatchSequenced;
        }

        uint256 totalBatchesBelowTarget = newBatchesVerified -
            totalBatchesAboveTarget;

        // Assume that batch fee will be max 128 bits, therefore:
        // MULTIPLIER_BATCH_FEE --> (< 4 bits)
        // MULTIPLIER_BATCH_FEE^32 --> (< 128 bits)
        // (< 128 bits) * (< 128 bits) = < 256 bits
        if (totalBatchesBelowTarget < totalBatchesAboveTarget) {
            uint256 diffBatches = totalBatchesAboveTarget -
                totalBatchesBelowTarget;
            uint256 accMultiplier = batchFee;

            while (diffBatches > 32) {
                accMultiplier =
                    (accMultiplier * (MULTIPLIER_BATCH_FEE ^ 32)) /
                    (10 ^ 32);
                diffBatches -= 32;
            }
            accMultiplier =
                (accMultiplier * (MULTIPLIER_BATCH_FEE ^ diffBatches)) /
                (10 ^ diffBatches);
            batchFee = accMultiplier;
        } else {
            uint256 diffBatches = totalBatchesBelowTarget -
                totalBatchesAboveTarget;
            uint256 accMultiplier = batchFee;

            while (diffBatches > 32) {
                accMultiplier =
                    (accMultiplier * (MULTIPLIER_BATCH_FEE ^ 32)) /
                    (10 ^ 32);
                diffBatches -= 32;
            }
            accMultiplier =
                (accMultiplier * (MULTIPLIER_BATCH_FEE ^ diffBatches)) /
                (10 ^ diffBatches);

            batchFee = (batchFee * batchFee) / accMultiplier;
        }
        // With this approach might happens that an aggregator recieve less rewards that expected if:
        // The new fee setted is below the current one, and batchs are sequenced
    }

    /**
     * @notice Function to get the last verified batch
     */
    function calculateBatchFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }

    /**
     * @notice Get the last verified batch
     */
    function getLastVerifiedBatch() public view returns (uint64) {
        if (lastPendingState > 0) {
            return pendingStateTransitions[lastPendingState].lastVerifiedBatch;
        } else {
            return lastVerifiedBatch;
        }
    }

    /**
     * @notice Returns a boolean indicatinf is the pendingStateNum is or not consolidable
     * Note that his function do not check if the pending state currently exist, or if it's consolidated already
     */
    function isPendingStateConsolidable(
        uint64 pendingStateNum
    ) public view returns (bool) {
        return (pendingStateTransitions[pendingStateNum].timestamp +
            pendingStateTimeout <=
            block.timestamp);
    }

    /**
     * @notice Function to calculate the reward to verify a single batch
     */
    function calculateRewardPerBatch() public view returns (uint256) {
        uint256 currentBalance = matic.balanceOf(address(this));

        // Total Sequenced Batches = forcedBatches to be sequenced (total forced Batches - sequenced Batches) + sequencedBatches
        // Total Batches to be verified = Total Sequenced Batches - verified Batches
        uint256 totalBatchesToVerify = ((lastForceBatch -
            lastForceBatchSequenced) + lastBatchSequenced) -
            getLastVerifiedBatch();

        return currentBalance / totalBatchesToVerify;
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param initNumBatch Batch which the aggregator starts teh verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function getInputSnarkBytes(
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 oldStateRoot,
        bytes32 newStateRoot
    ) public view returns (bytes memory) {
        // sanity checks
        bytes32 oldAccInputHash = sequencedBatches[initNumBatch].accInputHash;
        bytes32 newAccInputHash = sequencedBatches[finalNewBatch].accInputHash;

        require(
            initNumBatch == 0 || oldAccInputHash != bytes32(0),
            "ProofOfEfficiency::getInputSnarkBytes: oldAccInputHash does not exist"
        );

        require(
            newAccInputHash != bytes32(0),
            "ProofOfEfficiency::getInputSnarkBytes: newAccInputHash does not exist"
        );

        return
            abi.encodePacked(
                msg.sender,
                oldStateRoot,
                oldAccInputHash,
                initNumBatch,
                chainID,
                newStateRoot,
                newAccInputHash,
                newLocalExitRoot,
                finalNewBatch
            );
    }

    /**
     * @notice Internal function to activate emergency state on both PoE and Bridge contrats
     */
    function _activateEmergencyState() internal override {
        // Activate emergency state on bridge
        bridgeAddress.activateEmergencyState();

        // Activate emergency state on this contract
        super._activateEmergencyState();
    }
}
