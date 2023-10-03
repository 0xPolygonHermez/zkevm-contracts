// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IVerifierRollup.sol";
import "../interfaces/IPolygonZkEVMGlobalExitRoot.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IPolygonZkEVMBridge.sol";
import "../lib/EmergencyManager.sol";
import "../interfaces/IPolygonZkEVMErrors.sol";
import "../interfaces/IPolygonZkEVMV2Errors.sol";
import "./PolygonRollupManager.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
contract PolygonZkEVMV2 is
    Initializable,
    IPolygonZkEVMErrors,
    IPolygonZkEVMV2Errors
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

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Max transactions bytes that can be added in a single batch
    // Max keccaks circuit = (2**23 / 155286) * 44 = 2376
    // Bytes per keccak = 136
    // Minimum Static keccaks batch = 2
    // Max bytes allowed = (2376 - 2) * 136 = 322864 bytes - 1 byte padding
    // Rounded to 300000 bytes
    // In order to process the transaction, the data is approximately hashed twice for ecrecover:
    // 300000 bytes / 2 = 150000 bytes
    // Since geth pool currently only accepts at maximum 128kb transactions:
    // https://github.com/ethereum/go-ethereum/blob/master/core/txpool/txpool.go#L54
    // We will limit this length to be compliant with the geth restrictions since our node will use it
    // We let 8kb as a sanity margin
    uint256 internal constant _MAX_TRANSACTIONS_BYTE_LENGTH = 120000;

    // Max force batch transaction length
    // This is used to avoid huge calldata attacks, where the attacker call force batches from another contract
    uint256 internal constant _MAX_FORCE_BATCH_BYTE_LENGTH = 5000;

    // If a sequenced batch exceeds this timeout without being verified, the contract enters in emergency mode
    uint64 internal constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Maximum batches that can be verified in one call. It depends on our current metrics
    // This should be a protection against someone that tries to generate huge chunk of invalid batches, and we can't prove otherwise before the pending timeout expires
    uint64 internal constant _MAX_VERIFY_BATCHES = 1000;

    // Max batch multiplier per verification
    uint256 internal constant _MAX_BATCH_MULTIPLIER = 12;

    // Max batch fee value
    uint256 internal constant _MAX_BATCH_FEE = 1000 ether;

    // Min value batch fee
    uint256 internal constant _MIN_BATCH_FEE = 1 gwei;

    // Goldilocks prime field
    uint256 internal constant _GOLDILOCKS_PRIME_FIELD = 0xFFFFFFFF00000001; // 2 ** 64 - 2 ** 32 + 1

    // Max uint64
    uint256 internal constant _MAX_UINT_64 = type(uint64).max; // 0xFFFFFFFFFFFFFFFF

    // MATIC token address // POL?
    IERC20Upgradeable public immutable matic;

    // Rollup verifier interface
    IVerifierRollup public immutable rollupVerifier;

    // Global Exit Root interface
    IPolygonZkEVMGlobalExitRoot public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // Trusted sequencer address
    address public trustedSequencer;

    // Gap batch fee
    uint256 public gapBatchFee;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 globalExitRoot, unint64 minForcedTimestamp)
    mapping(uint64 => bytes32) public forcedBatches;

    // Last sequenced timestamp
    uint64 public lastTimestamp;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last forced batch
    uint64 public lastForceBatch;

    // Gap Last batch verified by the aggregators
    uint64 public gasLastVerifiedBatch;

    // Trusted aggregator address
    address public gapTrustedAggregator;

    // State root mapping
    // BatchNum --> state root
    mapping(uint64 => bytes32) public gapBatchNumToStateRoot;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Pending state mapping
    // pendingStateNumber --> PendingState
    mapping(uint256 => PendingState) public gapPendingStateTransitions;

    // Last pending state
    uint64 public gapLastPendingState;

    // Last pending state consolidated
    uint64 public gapLastPendingStateConsolidated;

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public gapPendingStateTimeout;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    uint64 public gapTrustedAggregatorTimeout;

    // Address that will be able to adjust contract parameters or stop the emergency state
    address public admin;

    // This account will be able to accept the admin role
    address public pendingAdmin;

    // Force batch timeout
    uint64 public forceBatchTimeout;

    // Indicates if forced batches are disallowed
    bool public isForcedBatchDisallowed;

    // Indicates the current version
    uint256 public gapVersion;

    // Last batch verified before the last upgrade
    uint256 public gapLastVerifiedBatchBeforeUpgrade;

    // Rollup manager
    PolygonRollupManager public rollupManager;

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
    event VerifyBatchesTrustedAggregator(
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
     * @dev Emitted when the admin updates the trusted sequencer address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when the admin updates the sequencer URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @dev Emitted when the admin updates the trusted aggregator timeout
     */
    event SetTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout);

    /**
     * @dev Emitted when the admin updates the pending state timeout
     */
    event SetPendingStateTimeout(uint64 newPendingStateTimeout);

    /**
     * @dev Emitted when the admin updates the trusted aggregator address
     */
    event SetTrustedAggregator(address newTrustedAggregator);

    /**
     * @dev Emitted when the admin updates the multiplier batch fee
     */
    event SetMultiplierBatchFee(uint16 newMultiplierBatchFee);

    /**
     * @dev Emitted when the admin updates the verify batch timeout
     */
    event SetVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget);

    /**
     * @dev Emitted when the admin update the force batch timeout
     */
    event SetForceBatchTimeout(uint64 newforceBatchTimeout);

    /**
     * @dev Emitted when activate force batches
     */
    event ActivateForceBatches();

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
     * @dev Emitted everytime the forkID is updated, this includes the first initialization of the contract
     * This event is intended to be emitted for every upgrade of the contract with relevant changes for the nodes
     */
    event UpdateZkEVMVersion(uint64 numBatch, uint64 forkID, string version);

    // General parameters that will have in common all networks that deploys rollup manager

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier Rollup verifier address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     */
    constructor(
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        IPolygonZkEVMBridge _bridgeAddress,
        PolygonRollupManager _rollupManager
    ) {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        bridgeAddress = _bridgeAddress;
        rollupManager = _rollupManager;
    }

    /**
     * @param _admin Admin address
     * @param _trustedSequencer Trusted sequencer address
     * @param _trustedSequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _version version
     */
    function initialize(
        address _admin,
        address _trustedSequencer,
        string memory _trustedSequencerURL,
        string memory _networkName,
        string calldata _version
    ) external initializer {
        admin = _admin;
        trustedSequencer = _trustedSequencer;

        trustedSequencerURL = _trustedSequencerURL;
        networkName = _networkName;

        // Constant deployment variables
        forceBatchTimeout = 5 days;
        isForcedBatchDisallowed = true;

        // version events review
    }

    modifier onlyAdmin() {
        if (admin != msg.sender) {
            revert OnlyAdmin();
        }
        _;
    }

    modifier onlyTrustedSequencer() {
        if (trustedSequencer != msg.sender) {
            revert OnlyTrustedSequencer();
        }
        _;
    }

    modifier isForceBatchAllowed() {
        if (isForcedBatchDisallowed) {
            revert ForceBatchNotAllowed();
        }
        _;
    }

    modifier onlyRollupManager() {
        if (address(rollupManager) != msg.sender) {
            revert OnlyRollupManager();
        }
        _;
    }

    /////////////////////////////////////
    // Sequence/Verify batches functions
    ////////////////////////////////////

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which holds the necessary data to append new batches to the sequence
     * @param l2Coinbase Address that will receive the fees from L2
     */
    function sequenceBatches(
        BatchData[] calldata batches,
        address l2Coinbase
    ) external onlyTrustedSequencer {
        uint256 batchesNum = batches.length;
        if (batchesNum == 0) {
            revert SequenceZeroBatches();
        }

        if (batchesNum > _MAX_VERIFY_BATCHES) {
            revert ExceedMaxVerifyBatches();
        }

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
        // Update currentBatchSequenced
        currentBatchSequenced += uint64(batchesNum);

        // Sanity check, should be unreachable
        if (currentLastForceBatchSequenced > lastForceBatch) {
            revert ForceBatchesOverflow();
        }

        // Update sequencedBatches mapping
        sequencedBatches[currentBatchSequenced] = SequencedBatchData({
            accInputHash: currentAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: lastBatchSequenced
        });

        // Store back the storage variables
        lastTimestamp = currentTimestamp;
        lastBatchSequenced = currentBatchSequenced;

        uint256 nonForcedBatchesSequenced = batchesNum;

        // Check if there has been forced batches
        if (currentLastForceBatchSequenced != initLastForceBatchSequenced) {
            // substract forced batches
            nonForcedBatchesSequenced -=
                currentLastForceBatchSequenced -
                initLastForceBatchSequenced;

            // Store new last force batch sequenced
            lastForceBatchSequenced = currentLastForceBatchSequenced;
        }
        // Pay collateral for every non-forced batch submitted
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            rollupManager.getBatchFee() * nonForcedBatchesSequenced
        );

        // Update global exit root if there are new deposits TODO check in rollup manager
        bridgeAddress.updateGlobalExitRoot();

        rollupManager.onSequenceBatches(
            currentBatchSequenced,
            currentAccInputHash
        );

        emit SequenceBatches(currentBatchSequenced);
    }

    /**
     * @notice Reward batches, can only be called by the rollup manager
     * @param lastVerifiedBatch Batches to reward
     */
    function onVerifyBatches(
        uint64 lastVerifiedBatch,
        bytes32 stateRoot,
        address aggregator
    ) public onlyRollupManager {
        // emit event?!!
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
     * @param maticAmount Max amount of matic tokens that the sender is willing to pay
     */
    function forceBatch(
        bytes calldata transactions,
        uint256 maticAmount
    ) public isForceBatchAllowed {
        // Calculate matic collateral
        uint256 maticFee = onlyRollupManager.getForcedBatchFee();

        if (maticFee > maticAmount) {
            revert NotEnoughMaticAmount();
        }

        if (transactions.length > _MAX_FORCE_BATCH_BYTE_LENGTH) {
            revert TransactionsLengthAboveMax();
        }

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
    ) external isForceBatchAllowed {
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
                    currentBatch.minForcedTimestamp + forceBatchTimeout >
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

        rollupManager.onSequenceBatches(
            currentBatchSequenced,
            batchesNum,
            currentAccInputHash
        );

        emit SequenceForceBatches(currentBatchSequenced);
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequencer
     */
    function setTrustedSequencer(
        address newTrustedSequencer
    ) external onlyAdmin {
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
     * @notice Allow the admin to set the forcedBatchTimeout
     * The new value can only be lower, except if emergency state is active
     * @param newforceBatchTimeout New force batch timeout
     */
    function setForceBatchTimeout(
        uint64 newforceBatchTimeout
    ) external onlyAdmin {
        if (newforceBatchTimeout > _HALT_AGGREGATION_TIMEOUT) {
            revert InvalidRangeForceBatchTimeout();
        }

        if (!rollupManager.isEmergencyState()) {
            if (newforceBatchTimeout >= forceBatchTimeout) {
                revert InvalidRangeForceBatchTimeout();
            }
        }

        forceBatchTimeout = newforceBatchTimeout;
        emit SetForceBatchTimeout(newforceBatchTimeout);
    }

    /**
     * @notice Allow the admin to turn on the force batches
     * This action is not reversible
     */
    function activateForceBatches() external onlyAdmin {
        if (!isForcedBatchDisallowed) {
            revert ForceBatchesAlreadyActive();
        }
        isForcedBatchDisallowed = false;
        emit ActivateForceBatches();
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
        if (pendingAdmin != msg.sender) {
            revert OnlyPendingAdmin();
        }

        admin = pendingAdmin;
        emit AcceptAdminRole(pendingAdmin);
    }
}
