// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IPolygonZkEVMGlobalExitRoot.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IPolygonZkEVMBridge.sol";
import "./lib/EmergencyManager.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract PolygonZkEVM is OwnableUpgradeable, EmergencyManager {
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
     * @notice Struct which will be stored for every batch sequence
     * @param accInputHash Hash chain that contains all the information to process a batch:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     * @param previousLastBatchSequenced Previous last batch sequenced before the current one, this is used to properly calculate the fees
     */
    struct SequencedBatchData {
        bytes32 accInputHash;
        uint64 sequencedTimestamp;
        uint64 previousLastBatchSequenced;
    }

    /**
     * @notice Struct to store the pending states
     * Pending state will be an intermediary state, that after a timeout can be consolidated, which means that will be added
     * to the state root mapping, and the global exit root will be updated
     * This is a protection mechanism against soundness attacks, that will be turned off in the future
     * @param timestamp Timestamp where the pending state is added to the queue
     * @param lastVerifiedBatch Last batch verified batch of this pending state
     * @param exitRoot Pending exit root
     * @param stateRoot Pending state root
     */
    struct PendingState {
        uint64 timestamp;
        uint64 lastVerifiedBatch;
        bytes32 exitRoot;
        bytes32 stateRoot;
    }

    /**
     * @notice Struct to call initialize, this saves gas because pack the parameters and avoid stack too deep errors.
     * @param admin Admin address
     * @param trustedSequencer Trusted sequencer address
     * @param pendingStateTimeout Pending state timeout
     * @param trustedAggregator Trusted aggregator
     * @param trustedAggregatorTimeout Trusted aggregator timeout
     */
    struct InitializePackedParameters {
        address admin;
        address trustedSequencer;
        uint64 pendingStateTimeout;
        address trustedAggregator;
        uint64 trustedAggregatorTimeout;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Max transactions bytes that can be added in a single batch
    // Max keccaks circuit = (2**23 / 155286) * 44 = 2376
    // Bytes per keccak = 136
    // Minimum Static keccaks batch = 2
    // Max bytes allowed = (2376 - 2) * 136 = 322864 bytes - 1 byte padding
    // Rounded to 300000 bytes
    uint256 private constant _MAX_TRANSACTIONS_BYTE_LENGTH = 300000;

    // Force batch timeout
    uint64 private constant _FORCE_BATCH_TIMEOUT = 5 days;

    // If a sequenced batch exceeds this timeout without being verified, the contract enters in emergency mode
    uint64 private constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Maximum batches that can be verified in one call. It depends on our current metrics
    // This should be a protection against someone that tries to generate huge chunk of invalid batches, and we can't prove otherwise before the pending timeout expires
    uint64 private constant _MAX_VERIFY_BATCHES = 1000;

    // Max batch multiplier per verification
    uint256 private constant _MAX_BATCH_MULTIPLIER = 12;

    // Max batch fee value
    uint256 private constant _MAX_BATCH_FEE = 1000 ether;

    // Min value batch fee
    uint256 private constant _MIN_BATCH_FEE = 1 gwei;

    // MATIC token address
    IERC20Upgradeable public immutable matic;

    // Rollup verifier interface
    IVerifierRollup public immutable rollupVerifier;

    // Global Exit Root interface
    IPolygonZkEVMGlobalExitRoot public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // L2 chain identifier
    uint64 public immutable chainID;

    // Time target of the verification of a batch
    // Adaptatly the batchFee will be updated to achieve this target
    uint64 public verifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    uint16 public multiplierBatchFee;

    // Trusted sequencer address
    address public trustedSequencer;

    // Current matic fee per batch sequenced
    uint256 public batchFee;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 globalExitRoot, unint64 minForcedTimestamp)
    mapping(uint64 => bytes32) public forcedBatches;

    // Queue of batches that defines the virtual state
    // SequenceBatchNum --> SequencedBatchData
    mapping(uint64 => SequencedBatchData) public sequencedBatches;

    // Last sequenced timestamp
    uint64 public lastTimestamp;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last forced batch
    uint64 public lastForceBatch;

    // Last batch verified by the aggregators
    uint64 public lastVerifiedBatch;

    // Trusted aggregator address
    address public trustedAggregator;

    // State root mapping
    // BatchNum --> state root
    mapping(uint64 => bytes32) public batchNumToStateRoot;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Pending state mapping
    // pendingStateNumber --> PendingState
    mapping(uint256 => PendingState) public pendingStateTransitions;

    // Last pending state
    uint64 public lastPendingState;

    // Last pending state consolidated
    uint64 public lastPendingStateConsolidated;

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public pendingStateTimeout;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    uint64 public trustedAggregatorTimeout;

    // Address that will be able to adjust contract parameters or stop the emergency state
    address public admin;

    // This account will be able to accept the admin role
    address public pendingAdmin;

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
        uint64 indexed pendingStateNum
    );

    /**
     * @dev Emitted when the admin update the trusted sequencer address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when the admin update the sequencer URL
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
     * @dev Emitted when the admin update the multiplier batch fee
     */
    event SetMultiplierBatchFee(uint16 newMultiplierBatchFee);

    /**
     * @dev Emitted when the admin update the verify batch timeout
     */
    event SetVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget);

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAdminRole(address newPendingAdmin);

   /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAdminRole(address newAdmin);

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
        uint64 _chainID
    ) {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        bridgeAddress = _bridgeAddress;
        chainID =_chainID;
    }

    /**
     * @param initializePackedParameters Struct to save gas and avoid stack too deep errors
     * @param genesisRoot Rollup genesis root
     * @param _trustedSequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     */
    function initialize(
        InitializePackedParameters calldata initializePackedParameters,
        bytes32 genesisRoot,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) external initializer {
        
        admin = initializePackedParameters.admin;
        trustedSequencer = initializePackedParameters.trustedSequencer;
        trustedAggregator = initializePackedParameters.trustedAggregator;
        batchNumToStateRoot[0] = genesisRoot;
           trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;

        // Check initialize parameters
        require(
            initializePackedParameters.pendingStateTimeout <= _HALT_AGGREGATION_TIMEOUT,
            "PolygonZkEVM::initialize: Exceed halt aggregation timeout"
        );
        pendingStateTimeout = initializePackedParameters.pendingStateTimeout;

        require(
            initializePackedParameters.trustedAggregatorTimeout <= _HALT_AGGREGATION_TIMEOUT,
            "PolygonZkEVM::initialize: Exceed halt aggregation timeout"
        );
        trustedAggregatorTimeout = initializePackedParameters.trustedAggregatorTimeout;

        // Constant variables
        batchFee = 10 ** 18; // 1 Matic
        verifyBatchTimeTarget = 30 minutes;
        multiplierBatchFee = 1002;

        // Initialize OZ contracts
        __Ownable_init_unchained();
    }

    modifier onlyAdmin() {
        require(admin == msg.sender, "PolygonZkEVM::onlyAdmin: Only admin");
        _;
    }

    modifier onlyTrustedSequencer() {
        require(
            trustedSequencer == msg.sender,
            "PolygonZkEVM::onlyTrustedSequencer: Only trusted sequencer"
        );
        _;
    }

    modifier onlyTrustedAggregator() {
        require(
            trustedAggregator == msg.sender,
            "PolygonZkEVM::onlyTrustedAggregator: Only trusted aggregator"
        );
        _;
    }

    /////////////////////////////////////
    // Sequence/Verify batches functions
    ////////////////////////////////////

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which holds the necessary data to append new batches to the sequence
     */
    function sequenceBatches(
        BatchData[] calldata batches
    ) external ifNotEmergencyState onlyTrustedSequencer {
        uint256 batchesNum = batches.length;
        require(
            batchesNum > 0,
            "PolygonZkEVM::sequenceBatches: At least must sequence 1 batch"
        );

        require(
            batchesNum <= _MAX_VERIFY_BATCHES,
            "PolygonZkEVM::sequenceBatches: Cannot sequence that many batches"
        );

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = sequencedBatches[currentBatchSequenced]
            .accInputHash;

        // Store in a temporal variable, for avoid access again the storage slot
        uint64 initLastForceBatchSequenced = currentLastForceBatchSequenced;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Store the current transactions hash since can be used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(currentBatch.transactions);

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

                require(
                    hashedForcedBatchData ==
                        forcedBatches[currentLastForceBatchSequenced],
                    "PolygonZkEVM::sequenceBatches: Forced batches data must match"
                );

                // Delete forceBatch data since won't be used anymore
                delete forcedBatches[currentLastForceBatchSequenced];

                // Check timestamp is bigger than min timestamp
                require(
                    currentBatch.timestamp >= currentBatch.minForcedTimestamp,
                    "PolygonZkEVM::sequenceBatches: Forced batches timestamp must be bigger or equal than min"
                );
            } else {
                // Check global exit root exists with proper batch length. These checks are already done in the forceBatches call
                require(
                    currentBatch.globalExitRoot == bytes32(0) ||
                        globalExitRootManager.globalExitRootMap(
                            currentBatch.globalExitRoot
                        ) !=
                        0,
                    "PolygonZkEVM::sequenceBatches: Global exit root must exist"
                );

                require(
                    currentBatch.transactions.length <=
                        _MAX_TRANSACTIONS_BYTE_LENGTH,
                    "PolygonZkEVM::sequenceBatches: Transactions bytes overflow"
                );
            }

            // Check Batch timestamps are correct
            require(
                currentBatch.timestamp >= currentTimestamp &&
                    currentBatch.timestamp <= block.timestamp,
                "PolygonZkEVM::sequenceBatches: Timestamp must be inside range"
            );

            // Calculate next accumulated input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    currentTransactionsHash,
                    currentBatch.globalExitRoot,
                    currentBatch.timestamp,
                    msg.sender
                )
            );

            // Update timestamp
            currentTimestamp = currentBatch.timestamp;
        }
        // Update currentBatchSequenced
        currentBatchSequenced += uint64(batchesNum);

        // Sanity check, should be unreachable
        require(
            currentLastForceBatchSequenced <= lastForceBatch,
            "PolygonZkEVM::sequenceBatches: Force batches overflow"
        );

        uint256 nonForcedBatchesSequenced = batchesNum - (currentLastForceBatchSequenced - initLastForceBatchSequenced);

        // Update sequencedBatches mapping
        sequencedBatches[currentBatchSequenced] = SequencedBatchData({
            accInputHash: currentAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: lastBatchSequenced
        });

        // Store back the storage variables
        lastTimestamp = currentTimestamp;
        lastBatchSequenced = currentBatchSequenced;

        if (currentLastForceBatchSequenced != initLastForceBatchSequenced)  
            lastForceBatchSequenced = currentLastForceBatchSequenced;

        // Pay collateral for every non-forced batch submitted
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            getCurrentBatchFee() * nonForcedBatchesSequenced
        );

        // Consolidate pending state if possible
        _tryConsolidatePendingState();

        emit SequenceBatches(currentBatchSequenced);
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
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
    ) external ifNotEmergencyState {
        // Check if the trusted aggregator timeout expired,
        // Note that the sequencedBatches struct must exists for this finalNewBatch, if not newAccInputHash will be 0
        require(
            sequencedBatches[finalNewBatch].sequencedTimestamp +
                trustedAggregatorTimeout <=
                block.timestamp,
            "PolygonZkEVM::verifyBatches: Trusted aggregator timeout not expired"
        );

        require(
            finalNewBatch - initNumBatch <= _MAX_VERIFY_BATCHES,
            "PolygonZkEVM::verifyBatches: Cannot verify that many batches"
        );

        _verifyAndRewardBatches(
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
            _tryConsolidatePendingState();

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
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
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
    ) external onlyTrustedAggregator {
        _verifyAndRewardBatches(
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
     * @notice Verify and reward batches internal function
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function _verifyAndRewardBatches(
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
                "PolygonZkEVM::_verifyBatches: pendingStateNum must be less or equal than lastPendingState"
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
                "PolygonZkEVM::_verifyBatches: initNumBatch must match the pending state batch"
            );
        } else {
            // Use consolidated state
            oldStateRoot = batchNumToStateRoot[initNumBatch];
            require(
                oldStateRoot != bytes32(0),
                "PolygonZkEVM::_verifyBatches: initNumBatch state root does not exist"
            );

            // Check initNumBatch is inside the range, sanity check
            require(
                initNumBatch <= currentLastVerifiedBatch,
                "PolygonZkEVM::_verifyBatches: initNumBatch must be less or equal than currentLastVerifiedBatch"
            );
        }

        // Check final batch
        require(
            finalNewBatch > currentLastVerifiedBatch,
            "PolygonZkEVM::_verifyBatches: finalNewBatch must be bigger than currentLastVerifiedBatch"
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
            "PolygonZkEVM::_verifyBatches: Invalid proof"
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
     * It tries to consolidate the first and the middle pending state in the queue
     */
    function _tryConsolidatePendingState() internal {
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
                    _consolidatePendingState(middlePendingState);
                } else {
                    _consolidatePendingState(nextPendingState);
                }
            }
        }
    }

    /**
     * @notice Allows to consolidate any pending state that has already exceed the pendingStateTimeout
     * Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions
     * @param pendingStateNum Pending state to consolidate
     */
    function consolidatePendingState(uint64 pendingStateNum) external {
        // Check if pending state can be consolidated
        // If trusted aggregator is the sender, do not check the timeout or the emergency state
        if (msg.sender != trustedAggregator) {
            require(!isEmergencyState,"PolygonZkEVM::consolidatePendingState: only if not emergency state");
            require(
                isPendingStateConsolidable(pendingStateNum),
                "PolygonZkEVM::consolidatePendingState: Pending state is not ready to be consolidated"
            );
        }
        _consolidatePendingState(pendingStateNum);
    }

    /**
     * @notice Internal function to consolidate any pending state that has already exceed the pendingStateTimeout
     * @param pendingStateNum Pending state to consolidate
     */
    function _consolidatePendingState(uint64 pendingStateNum) internal {
        // Check if pendingStateNum is in correct range
        // - not consolidated (implicity checks that is not 0)
        // - exist ( has been added)
        require(
                pendingStateNum > lastPendingStateConsolidated &&
                pendingStateNum <= lastPendingState,
            "PolygonZkEVM::_consolidatePendingState: pendingStateNum invalid"
        );

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
            pendingStateNum
        );
    }

    /**
     * @notice Function to update the batch fee based on the new verfied batches
     * The batch fee will not be updated when the trusted aggregator verify batches
     * @param newLastVerifiedBatch New last verified batch
     */
    function _updateBatchFee(uint64 newLastVerifiedBatch) internal {
        uint64 currentLastVerifiedBatch = getLastVerifiedBatch();
        uint64 currentBatch = newLastVerifiedBatch;

        uint256 totalBatchesBelowTarget;
        uint256 newBatchesVerified = newLastVerifiedBatch -
            currentLastVerifiedBatch;

        uint256 targetTimestamp = block.timestamp - verifyBatchTimeTarget;

        while (currentBatch != currentLastVerifiedBatch) {
            // Load sequenced batchdata
            SequencedBatchData
                storage currentSequencedBatchData = sequencedBatches[
                    currentBatch
                ];

            // Check if timestamp is below the verifyBatchTimeTarget
            if (
                targetTimestamp < currentSequencedBatchData.sequencedTimestamp 
            ) {
                totalBatchesBelowTarget +=
                    currentBatch -
                    currentSequencedBatchData.previousLastBatchSequenced;

                // update currentBatch
                currentBatch = currentSequencedBatchData.previousLastBatchSequenced;
            } else {
                 // Since the rest of batches will be above
                break; 
            }
        }

        uint256 totalBatchesAboveTarget = newBatchesVerified -
            totalBatchesBelowTarget;

        // Assume that batch fee will be max 128 bits, therefore:
        // multiplierBatchFee --> (< 10 bits)
        // _MAX_BATCH_MULTIPLIER = 12
        // multiplierBatchFee ** _MAX_BATCH_MULTIPLIER --> (< 128 bits)
        // (< 128 bits) * (< 128 bits) = < 256 bits
        if (totalBatchesBelowTarget < totalBatchesAboveTarget) {
            // There are more batches above target, fee is multiplied
            uint256 diffBatches = totalBatchesAboveTarget -
                totalBatchesBelowTarget;

            diffBatches = diffBatches > _MAX_BATCH_MULTIPLIER
                ? _MAX_BATCH_MULTIPLIER
                : diffBatches;

            // For every multiplierBatchFee multiplication we must shift 3 zeroes since we have 3 decimals
            batchFee =
                (batchFee * (uint256(multiplierBatchFee) ** diffBatches)) /
                (10 ** (diffBatches * 3));
        } else {
            // There are more batches below target, fee is divided
            uint256 diffBatches = totalBatchesBelowTarget -
                totalBatchesAboveTarget;

            diffBatches = diffBatches > _MAX_BATCH_MULTIPLIER
                ? _MAX_BATCH_MULTIPLIER
                : diffBatches;

            // For every multiplierBatchFee multiplication we must shift 3 zeroes since we have 3 decimals
            uint256 accDivisor = (uint256(1 ether) *
                (uint256(multiplierBatchFee) ** diffBatches)) /
                 (10 ** (diffBatches * 3));

            // multiplyFactor = multiplierBatchFee ** diffBatches / 10 ** (diffBatches * 3)
            // accDivisor = 1E18 * multiplyFactor
            // 1E18 * batchFee / accDivisor = batchFee / multiplyFactor
            batchFee = (uint256(1 ether) * batchFee) / accDivisor;
        }
        
        if(batchFee > _MAX_BATCH_FEE) {
            batchFee = _MAX_BATCH_FEE;
        } else if(batchFee < _MIN_BATCH_FEE) {
            batchFee = _MIN_BATCH_FEE;
        }
    }

    ////////////////////////////
    // Force batches functions
    ////////////////////////////

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions.
     * This should be used only in extreme cases where the trusted sequencer does not work as expected
     * Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
     * In order to assure that users force transactions will be processed properly, user must not sign any other transaction
     * with the same nonce
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(
        bytes calldata transactions,
        uint256 maticAmount
    ) external ifNotEmergencyState {
        // Calculate matic collateral
        uint256 maticFee = getCurrentBatchFee();

        require(
            maticFee <= maticAmount,
            "PolygonZkEVM::forceBatch: Not enough matic"
        );

        require(
            transactions.length <= _MAX_TRANSACTIONS_BYTE_LENGTH,
            "PolygonZkEVM::forceBatch: Transactions bytes overflow"
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

        if (msg.sender == tx.origin) {
            // Getting the calldata from an EOA is easy so no need to put the `transactions` in the event
            emit ForceBatch(lastForceBatch, lastGlobalExitRoot, msg.sender, "");
        } else {
            // Getting internal transaction calldata is complicated (because it requires an archive node) 
            // Therefore it's worth it to put the `transactions` in the event, which is easy to query
            emit ForceBatch(
                lastForceBatch,
                lastGlobalExitRoot,
                msg.sender,
                transactions
            );
        }
    }

    /**
     * @notice Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period
     * @param batches Struct array which holds the necessary data to append force batches
     */
    function sequenceForceBatches(
        ForcedBatchData[] calldata batches
    ) external ifNotEmergencyState {
        uint256 batchesNum = batches.length;

        require(
            batchesNum > 0,
            "PolygonZkEVM::sequenceForceBatches: Must force at least 1 batch"
        );

        require(
            batchesNum <= _MAX_VERIFY_BATCHES,
            "PolygonZkEVM::sequenceForceBatches: Cannot verify that many batches"
        );

        require(
            uint256(lastForceBatchSequenced) + batchesNum <= uint256(lastForceBatch),
            "PolygonZkEVM::sequenceForceBatches: Force batch invalid"
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

            // Store the current transactions hash since it's used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(currentBatch.transactions);

            // Check forced data matches
            bytes32 hashedForcedBatchData = keccak256(
                abi.encodePacked(
                    currentTransactionsHash,
                    currentBatch.globalExitRoot,
                    currentBatch.minForcedTimestamp
                )
            );

            require(
                hashedForcedBatchData ==
                    forcedBatches[currentLastForceBatchSequenced],
                "PolygonZkEVM::sequenceForceBatches: Forced batches data must match"
            );

            // Delete forceBatch data since won't be used anymore
            delete forcedBatches[currentLastForceBatchSequenced];

            if (i == (batchesNum - 1)) {
                // The last batch will have the most restrictive timestamp
                require(
                    currentBatch.minForcedTimestamp + _FORCE_BATCH_TIMEOUT <=
                        block.timestamp,
                    "PolygonZkEVM::sequenceForceBatches: Forced batch is not in timeout period"
                );
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

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequencer
     */
    function setTrustedSequencer(address newTrustedSequencer) external onlyAdmin {
        trustedSequencer = newTrustedSequencer;

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the admin to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(
        string memory newTrustedSequencerURL
    ) external onlyAdmin {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
    }

    /**
     * @notice Allow the admin to set a new trusted aggregator address
     * @param newTrustedAggregator Address of the new trusted aggregator
     */
    function setTrustedAggregator(
        address newTrustedAggregator
    ) external onlyAdmin {
        trustedAggregator = newTrustedAggregator;

        emit SetTrustedAggregator(newTrustedAggregator);
    }

    /**
     * @notice Allow the admin to set a new pending state timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newTrustedAggregatorTimeout Trusted aggregator timeout
     */
    function setTrustedAggregatorTimeout(
        uint64 newTrustedAggregatorTimeout
    ) external onlyAdmin {
        require(
            newTrustedAggregatorTimeout <= _HALT_AGGREGATION_TIMEOUT,
            "PolygonZkEVM::setTrustedAggregatorTimeout: Exceed max halt aggregation timeout"
        );
        if (!isEmergencyState) {
            require(
                newTrustedAggregatorTimeout < trustedAggregatorTimeout,
                "PolygonZkEVM::setTrustedAggregatorTimeout: New timeout must be lower"
            );
        }

        trustedAggregatorTimeout = newTrustedAggregatorTimeout;
        emit SetTrustedAggregatorTimeout(newTrustedAggregatorTimeout);
    }

    /**
     * @notice Allow the admin to set a new trusted aggregator timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newPendingStateTimeout Trusted aggregator timeout
     */
    function setPendingStateTimeout(
        uint64 newPendingStateTimeout
    ) external onlyAdmin {
        require(
            newPendingStateTimeout <= _HALT_AGGREGATION_TIMEOUT,
            "PolygonZkEVM::setPendingStateTimeout: Exceed max halt aggregation timeout"
        );
        if (!isEmergencyState) {
            require(
                newPendingStateTimeout < pendingStateTimeout,
                "PolygonZkEVM::setPendingStateTimeout: New timeout must be lower"
            );
        }

        pendingStateTimeout = newPendingStateTimeout;
        emit SetPendingStateTimeout(newPendingStateTimeout);
    }

    /**
     * @notice Allow the admin to set a new multiplier batch fee
     * @param newMultiplierBatchFee multiplier batch fee
     */
    function setMultiplierBatchFee(
        uint16 newMultiplierBatchFee
    ) external onlyAdmin {
        require(
            newMultiplierBatchFee >= 1000 && newMultiplierBatchFee < 1024,
            "PolygonZkEVM::setMultiplierBatchFee: newMultiplierBatchFee incorrect range"
        );

        multiplierBatchFee = newMultiplierBatchFee;
        emit SetMultiplierBatchFee(newMultiplierBatchFee);
    }

    /**
     * @notice Allow the admin to set a new verify batch time target
     * This value will only be relevant once the aggregation is decentralized, so
     * the trustedAggregatorTimeout should be zero or very close to zero
     * @param newVerifyBatchTimeTarget Verify batch time target
     */
    function setVerifyBatchTimeTarget(
        uint64 newVerifyBatchTimeTarget
    ) external onlyAdmin {
        require(
            newVerifyBatchTimeTarget < 1 days,
            "PolygonZkEVM::setVerifyBatchTimeTarget: setVerifyBatchTimeTarget incorrect range"
        );
        verifyBatchTimeTarget = newVerifyBatchTimeTarget;
        emit SetVerifyBatchTimeTarget(newVerifyBatchTimeTarget);
    }

    /**
     * @notice Starts the admin role transfer
     * This is a two step process, the pending admin must accepted to finalize the process
     * @param newPendingAdmin Address of the new pending admin
     */
    function transferAdminRole(address newPendingAdmin) external onlyAdmin {
        pendingAdmin = newPendingAdmin;
        emit TransferAdminRole(newPendingAdmin);
    }


    /**
     * @notice Allow the current pending admin to accept the admin role
     */
    function acceptAdminRole() external {
        require(pendingAdmin == msg.sender, "PolygonZkEVM::acceptAdminRole: caller is not pendingAdmin");
        admin = pendingAdmin;
        emit AcceptAdminRole(pendingAdmin);
    }

    /////////////////////////////////
    // Soundness protection functions
    /////////////////////////////////

    /**
     * @notice Allows the trusted aggregator to override the pending state
     * if its possible to prove a different state root given the same batches
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
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
    ) external onlyTrustedAggregator {
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
        trustedAggregatorTimeout = _HALT_AGGREGATION_TIMEOUT;

        emit OverridePendingState(finalNewBatch, newStateRoot, msg.sender);
    }

    /**
     * @notice Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
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
    ) external ifNotEmergencyState {
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
     * @notice Internal function that prove a different state root given the same batches to verify
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
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
                "PolygonZkEVM::_proveDistinctPendingState: pendingStateNum must be less or equal than lastPendingState"
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
                "PolygonZkEVM::_proveDistinctPendingState: initNumBatch must match the pending state batch"
            );
        } else {
            // Use consolidated state
            oldStateRoot = batchNumToStateRoot[initNumBatch];
            require(
                oldStateRoot != bytes32(0),
                "PolygonZkEVM::_proveDistinctPendingState: initNumBatch state root does not exist"
            );

            // Check initNumBatch is inside the range, sanity check
            require(
                initNumBatch <= lastVerifiedBatch,
                "PolygonZkEVM::_proveDistinctPendingState: initNumBatch must be less or equal than lastVerifiedBatch"
            );
        }

        // Assert final pending state num is in correct range
        // - exist ( has been added)
        // - bigger than the initPendingstate
        // - not consolidated
        require(
            finalPendingStateNum <= lastPendingState &&
                finalPendingStateNum > initPendingStateNum &&
                finalPendingStateNum > lastPendingStateConsolidated,
            "PolygonZkEVM::_proveDistinctPendingState: finalPendingStateNum incorrect"
        );

        // Check final num batch
        require(
            finalNewBatch ==
                pendingStateTransitions[finalPendingStateNum].lastVerifiedBatch,
            "PolygonZkEVM::_proveDistinctPendingState: finalNewBatch must be equal to currentLastVerifiedBatch"
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
            "PolygonZkEVM::_proveDistinctPendingState: Invalid proof"
        );

        require(
            pendingStateTransitions[finalPendingStateNum].stateRoot !=
                newStateRoot,
            "PolygonZkEVM::_proveDistinctPendingState: Stored root must be different than new state root"
        );
    }

    /**
     * @notice Function to activate emergency state, which also enable the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contracts
     * If not called by the owner must be provided a batcnNum that does not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period
     * @param sequencedBatchNum Sequenced batch number that has not been aggreagated in _HALT_AGGREGATION_TIMEOUT
     */
    function activateEmergencyState(uint64 sequencedBatchNum) external {
        if (msg.sender != owner()) {
            // Only check conditions if is not called by the owner
            uint64 currentLastVerifiedBatch = getLastVerifiedBatch();

            // Check that the batch has not been verified
            require(
                sequencedBatchNum > currentLastVerifiedBatch,
                "PolygonZkEVM::activateEmergencyState: Batch already verified"
            );

            // Check that the batch has been sequenced and this was the end of a sequence
            require(
                sequencedBatchNum <= lastBatchSequenced &&
                    sequencedBatches[sequencedBatchNum].sequencedTimestamp != 0,
                "PolygonZkEVM::activateEmergencyState: Batch not sequenced or not end of sequence"
            );

            // Check that has been passed _HALT_AGGREGATION_TIMEOUT since it was sequenced
            require(
                sequencedBatches[sequencedBatchNum].sequencedTimestamp +
                    _HALT_AGGREGATION_TIMEOUT <=
                    block.timestamp,
                "PolygonZkEVM::activateEmergencyState: Aggregation halt timeout is not expired"
            );
        }
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function deactivateEmergencyState() external onlyAdmin {
        // Deactivate emergency state on PolygonZkEVMBridge
        bridgeAddress.deactivateEmergencyState();

        // Deactivate emergency state on this contract
        super._deactivateEmergencyState();
    }

    /**
     * @notice Internal function to activate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function _activateEmergencyState() internal override {
        // Activate emergency state on PolygonZkEVM Bridge
        bridgeAddress.activateEmergencyState();

        // Activate emergency state on this contract
        super._activateEmergencyState();
    }

    ////////////////////////
    // public/view functions
    ////////////////////////

    /**
     * @notice Function to get the batch fee
     */
    function getCurrentBatchFee() public view returns (uint256) {
        return batchFee;
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
     * @notice Returns a boolean that indicates if the pendingStateNum is or not consolidable
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

        if (totalBatchesToVerify == 0) return 0;
        return currentBalance / totalBatchesToVerify;
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param initNumBatch Batch which the aggregator starts teh verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param oldStateRoot State root before batch is processed
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
            "PolygonZkEVM::getInputSnarkBytes: oldAccInputHash does not exist"
        );

        require(
            newAccInputHash != bytes32(0),
            "PolygonZkEVM::getInputSnarkBytes: newAccInputHash does not exist"
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
}
