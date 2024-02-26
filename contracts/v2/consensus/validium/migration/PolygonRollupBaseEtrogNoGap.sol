// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../../interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../../../../interfaces/IPolygonZkEVMErrors.sol";
import "../../../interfaces/IPolygonZkEVMVEtrogErrors.sol";
import "../../../PolygonRollupManager.sol";
import "../../../interfaces/IPolygonRollupBase.sol";
import "../../../interfaces/IPolygonZkEVMBridgeV2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "../../../lib/PolygonConstantsBase.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract PolygonRollupBaseEtrogNoGap is
    Initializable,
    PolygonConstantsBase,
    IPolygonZkEVMVEtrogErrors,
    IPolygonRollupBase
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which will be used to call sequenceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param forcedGlobalExitRoot Global exit root, empty when sequencing a non forced batch
     * @param forcedTimestamp Minimum timestamp of the force batch data, empty when sequencing a non forced batch
     * @param forcedBlockHashL1 blockHash snapshot of the force batch data, empty when sequencing a non forced batch
     */
    struct BatchData {
        bytes transactions;
        bytes32 forcedGlobalExitRoot;
        uint64 forcedTimestamp;
        bytes32 forcedBlockHashL1;
    }

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

    // In order to encode the initialize transaction of the bridge there's have a constant part and the metadata which is variable
    // Note the total transaction will be constrained to 65535 to avoid attacks and simplify the implementation

    // List rlp: 1 listLenLen "0xf9" (0xf7 + 2), + listLen 2 (32 bytes + txData bytes) (do not accept more than 65535 bytes)

    // First byte of the initialize bridge tx, indicates a list with a lengt of 2 bytes
    // Since the minimum constant bytes will be: 259 (tx data empty) + 31 (tx parameters) = 259 (0x103) will always take 2 bytes to express the lenght of the rlp
    // Note that more than 2 bytes of list len is not supported, since it's constrained to 65535
    uint8 public constant INITIALIZE_TX_BRIDGE_LIST_LEN_LEN = 0xf9;

    // Tx parameters until the bridge address
    bytes public constant INITIALIZE_TX_BRIDGE_PARAMS = hex"80808401c9c38094";

    // RLP encoded metadata (non empty)

    // TxData bytes: 164 bytes data ( signature 4 bytes + 5 parameters*32bytes +
    // (abi encoded metadata: 32 bytes position + 32 bytes len + 32 bytes position name + 32 bytes length name + 32 bytes position Symbol + 32 bytes length Symbol
    //+ 32 bytes decimal )) min 7*32 bytes =
    // = 164 bytes + 224 bytes = 388 (0x0184) minimum
    // Extra data: nameLen padded to 32 bytes + symbol len padded to 32 bytes

    // Constant bytes:  1 nonce "0x80" + 1 gasPrice "0x80" + 5 gasLimit "0x8401c9c380" (30M gas)
    // + 21 to ("0x94" + bridgeAddress")  + 1 value "0x80" + 1 stringLenLen "0xb9" (0xb7 + 2) +
    // stringLen (0x0184 + nameLen padded to 32 bytes + symbol len padded to 32 bytes) + txData bytes = 32 bytes + txData bytes
    uint16 public constant INITIALIZE_TX_CONSTANT_BYTES = 32;

    // Tx parameters after the bridge address
    bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS =
        hex"80b9";

    // RLP empty metadata

    // TxData empty metadata bytes: 164 bytes data ( signature 4 bytes + 5 parameters*32bytes +
    // (abi encoded metadata: 32 bytes position + 32 bytes len = 2*32 bytes =
    // = 164 bytes + 64 bytes = 228 (0xe4)

    // Constant bytes empty metadata :  1 nonce "0x80" + 1 gasPrice "0x80" + 5 gasLimit "0x8401c9c380" (30M gas)
    // + 21 to ("0x94" + bridgeAddress")  + 1 value "0x80" + 1 stringLenLen "0xb8" (0xb7 + 1) +
    // 1 stringLen (0xe4) + txData bytes = 31 bytes + txData bytes empty metadata 228 = 259
    uint16 public constant INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA = 31;

    uint8 public constant INITIALIZE_TX_DATA_LEN_EMPTY_METADATA = 228; // 0xe4

    // Tx parameters after the bridge address
    bytes
        public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA =
        hex"80b8";

    // Signature used to initialize the bridge

    // V parameter of the initialize signature
    uint8 public constant SIGNATURE_INITIALIZE_TX_V = 27;

    // R parameter of the initialize signature
    bytes32 public constant SIGNATURE_INITIALIZE_TX_R =
        0x00000000000000000000000000000000000000000000000000000005ca1ab1e0;

    // S parameter of the initialize signature
    bytes32 public constant SIGNATURE_INITIALIZE_TX_S =
        0x000000000000000000000000000000000000000000000000000000005ca1ab1e;

    // Effective percentage of the initalize transaction
    bytes1 public constant INITIALIZE_TX_EFFECTIVE_PERCENTAGE = 0xFF;

    // Global Exit Root address L2
    IBasePolygonZkEVMGlobalExitRoot
        public constant GLOBAL_EXIT_ROOT_MANAGER_L2 =
        IBasePolygonZkEVMGlobalExitRoot(
            0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA
        );

    // Timestamp range that's given to the sequencer as a safety measure to avoid reverts if the transaction is mined to quickly
    uint256 public constant TIMESTAMP_RANGE = 36;

    // POL token address
    IERC20Upgradeable public immutable pol;

    // Global Exit Root interface
    IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridgeV2 public immutable bridgeAddress;

    // Rollup manager
    PolygonRollupManager public immutable rollupManager;

    // Address that will be able to adjust contract parameters
    address public admin;

    // This account will be able to accept the admin role
    address public pendingAdmin;

    // Trusted sequencer address
    address public trustedSequencer;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Current accumulate input hash
    bytes32 public lastAccInputHash;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 forcedGlobalExitRoot, unint64 forcedTimestamp, bytes32 forcedBlockHashL1)
    mapping(uint64 => bytes32) public forcedBatches;

    // Last forced batch
    uint64 public lastForceBatch;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Force batch timeout
    uint64 public forceBatchTimeout;

    // Indicates what address is able to do forced batches
    // If the address is set to 0, forced batches are open to everyone
    address public forceBatchAddress;

    // Token address that will be used to pay gas fees in this rollup. This variable it's just for read purposes
    address public gasTokenAddress;

    // Native network of the token address of the gas tokena address. This variable it's just for read purposes
    uint32 public gasTokenNetwork;

    /**
     * @dev Emitted when the trusted sequencer sends a new batch of transactions
     */
    event SequenceBatches(uint64 indexed numBatch, bytes32 l1InfoRoot);

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
     * @dev Emitted when the contract is initialized, contain the first sequenced transaction
     */
    event InitialSequenceBatches(
        bytes transactions,
        bytes32 lastGlobalExitRoot,
        address sequencer
    );

    /**
     * @dev Emitted when a aggregator verifies batches
     */
    event VerifyBatches(
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
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
     * @dev Emitted when the admin update the force batch timeout
     */
    event SetForceBatchTimeout(uint64 newforceBatchTimeout);

    /**
     * @dev Emitted when the admin update the force batch address
     */
    event SetForceBatchAddress(address newForceBatchAddress);

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAdminRole(address newPendingAdmin);

    /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAdminRole(address newAdmin);

    // General parameters that will have in common all networks that deploys rollup manager

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
    ) {
        globalExitRootManager = _globalExitRootManager;
        pol = _pol;
        bridgeAddress = _bridgeAddress;
        rollupManager = _rollupManager;
    }

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
    ) external virtual onlyRollupManager initializer {
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

        rollupManager.onSequenceBatches(
            uint64(1), // num total batches
            newAccInputHash
        );

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

    modifier isSenderAllowedToForceBatches() {
        address cacheForceBatchAddress = forceBatchAddress;
        if (
            cacheForceBatchAddress != address(0) &&
            cacheForceBatchAddress != msg.sender
        ) {
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
     * @param maxSequenceTimestamp Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds).
     * This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.
     * @param initSequencedBatch This parameter must match the current last batch sequenced.
     * This will be a protection for the sequencer to avoid sending undesired data
     * @param l2Coinbase Address that will receive the fees from L2
     * note Pol is not a reentrant token
     */
    function sequenceBatches(
        BatchData[] calldata batches,
        uint64 maxSequenceTimestamp,
        uint64 initSequencedBatch,
        address l2Coinbase
    ) public virtual onlyTrustedSequencer {
        uint256 batchesNum = batches.length;
        if (batchesNum == 0) {
            revert SequenceZeroBatches();
        }

        if (batchesNum > _MAX_VERIFY_BATCHES) {
            revert ExceedMaxVerifyBatches();
        }

        // Check max sequence timestamp inside of range
        if (
            uint256(maxSequenceTimestamp) > (block.timestamp + TIMESTAMP_RANGE)
        ) {
            revert MaxTimestampSequenceInvalid();
        }

        // Update global exit root if there are new deposits
        bridgeAddress.updateGlobalExitRoot();

        // Get global batch variables
        bytes32 l1InfoRoot = globalExitRootManager.getRoot();

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
                        maxSequenceTimestamp,
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

        uint64 currentBatchSequenced = rollupManager.onSequenceBatches(
            uint64(batchesNum),
            currentAccInputHash
        );

        // Check init sequenced batch
        if (
            initSequencedBatch != (currentBatchSequenced - uint64(batchesNum))
        ) {
            revert InitSequencedBatchDoesNotMatch();
        }

        emit SequenceBatches(currentBatchSequenced, l1InfoRoot);
    }

    /**
     * @notice Callback on verify batches, can only be called by the rollup manager
     * @param lastVerifiedBatch Last verified batch
     * @param newStateRoot new state root
     * @param aggregator Aggregator address
     */
    function onVerifyBatches(
        uint64 lastVerifiedBatch,
        bytes32 newStateRoot,
        address aggregator
    ) public virtual override onlyRollupManager {
        emit VerifyBatches(lastVerifiedBatch, newStateRoot, aggregator);
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
     * @param polAmount Max amount of pol tokens that the sender is willing to pay
     */
    function forceBatch(
        bytes calldata transactions,
        uint256 polAmount
    ) public virtual isSenderAllowedToForceBatches {
        // Check if rollup manager is on emergency state
        if (rollupManager.isEmergencyState()) {
            revert ForceBatchesNotAllowedOnEmergencyState();
        }

        // Calculate pol collateral
        uint256 polFee = rollupManager.getForcedBatchFee();

        if (polFee > polAmount) {
            revert NotEnoughPOLAmount();
        }

        if (transactions.length > _MAX_FORCE_BATCH_BYTE_LENGTH) {
            revert TransactionsLengthAboveMax();
        }

        // keep the pol fees on this contract until forced it's sequenced
        pol.safeTransferFrom(msg.sender, address(this), polFee);

        // Get globalExitRoot global exit root
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Update forcedBatches mapping
        lastForceBatch++;

        forcedBatches[lastForceBatch] = keccak256(
            abi.encodePacked(
                keccak256(transactions),
                lastGlobalExitRoot,
                uint64(block.timestamp),
                blockhash(block.number - 1)
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
        BatchData[] calldata batches
    ) external virtual isSenderAllowedToForceBatches {
        // Check if rollup manager is on emergency state
        if (
            rollupManager.lastDeactivatedEmergencyStateTimestamp() +
                _HALT_AGGREGATION_TIMEOUT >
            block.timestamp
        ) {
            revert HaltTimeoutNotExpiredAfterEmergencyState();
        }

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
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = lastAccInputHash;

        // Sequence force batches
        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];
            currentLastForceBatchSequenced++;

            // Store the current transactions hash since it's used more than once for gas saving
            bytes32 currentTransactionsHash = keccak256(
                currentBatch.transactions
            );

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

            // Delete forceBatch data since won't be used anymore
            delete forcedBatches[currentLastForceBatchSequenced];

            if (i == (batchesNum - 1)) {
                // The last batch will have the most restrictive timestamp
                if (
                    currentBatch.forcedTimestamp + forceBatchTimeout >
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
                    currentBatch.forcedGlobalExitRoot,
                    currentBatch.forcedTimestamp,
                    msg.sender,
                    currentBatch.forcedBlockHashL1
                )
            );
        }

        // Transfer pol for every forced batch submitted
        pol.safeTransfer(
            address(rollupManager),
            calculatePolPerForceBatch() * (batchesNum)
        );

        // Store back the storage variables
        lastAccInputHash = currentAccInputHash;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        uint64 currentBatchSequenced = rollupManager.onSequenceBatches(
            uint64(batchesNum),
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
     * @notice Allow the admin to change the force batch address, that will be allowed to force batches
     * If address 0 is set, then everyone is able to force batches, this action is irreversible
     * @param newForceBatchAddress New force batch address
     */
    function setForceBatchAddress(
        address newForceBatchAddress
    ) external onlyAdmin {
        if (forceBatchAddress == address(0)) {
            revert ForceBatchesDecentralized();
        }
        forceBatchAddress = newForceBatchAddress;

        emit SetForceBatchAddress(newForceBatchAddress);
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

    //////////////////
    // view/pure functions
    //////////////////

    /**
     * @notice Function to calculate the reward for a forced batch
     */
    function calculatePolPerForceBatch() public view returns (uint256) {
        uint256 currentBalance = pol.balanceOf(address(this));

        // Pending forced Batches = last forced batch added - last forced batch sequenced
        uint256 pendingForcedBatches = lastForceBatch - lastForceBatchSequenced;

        if (pendingForcedBatches == 0) return 0;
        return currentBalance / pendingForcedBatches;
    }

    /**
     * @notice Generate Initialize transaction for hte bridge on L2
     * @param networkID Indicates the network identifier that will be used in the bridge
     * @param _gasTokenAddress Indicates the token address that will be used to pay gas fees in the new rollup
     * @param _gasTokenNetwork Indicates the native network of the token address
     * @param _gasTokenMetadata Abi encoded gas token metadata
     */
    function generateInitializeTransaction(
        uint32 networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        bytes memory _gasTokenMetadata
    ) public view returns (bytes memory) {
        bytes memory initializeBrigeData = abi.encodeCall(
            IPolygonZkEVMBridgeV2.initialize,
            (
                networkID,
                _gasTokenAddress,
                _gasTokenNetwork,
                GLOBAL_EXIT_ROOT_MANAGER_L2,
                address(0), // Rollup manager on L2 does not exist
                _gasTokenMetadata
            )
        );

        bytes memory bytesToSign;

        if (_gasTokenMetadata.length == 0) {
            bytesToSign = abi.encodePacked(
                INITIALIZE_TX_BRIDGE_LIST_LEN_LEN,
                uint16(initializeBrigeData.length) +
                    INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA, // do not support more than 2 bytes of length, intended to revert on overflow
                INITIALIZE_TX_BRIDGE_PARAMS,
                bridgeAddress,
                INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA,
                INITIALIZE_TX_DATA_LEN_EMPTY_METADATA,
                initializeBrigeData
            );
        } else {
            // Do not support more than 65535 bytes
            if (initializeBrigeData.length > type(uint16).max) {
                revert HugeTokenMetadataNotSupported();
            }
            uint16 initializeBrigeDataLen = uint16(initializeBrigeData.length);

            bytesToSign = abi.encodePacked(
                INITIALIZE_TX_BRIDGE_LIST_LEN_LEN,
                uint16(initializeBrigeData.length) +
                    INITIALIZE_TX_CONSTANT_BYTES, // do not support more than 2 bytes of length, intended to revert on overflow
                INITIALIZE_TX_BRIDGE_PARAMS,
                bridgeAddress,
                INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS,
                initializeBrigeDataLen,
                initializeBrigeData
            );
        }

        // Sanity check that the ecrecover will work
        // Should never happen that giving a valid signature, ecrecover "breaks"
        address signer = ecrecover(
            keccak256(bytesToSign),
            SIGNATURE_INITIALIZE_TX_V,
            SIGNATURE_INITIALIZE_TX_R,
            SIGNATURE_INITIALIZE_TX_S
        );

        if (signer == address(0)) {
            revert InvalidInitializeTransaction();
        }

        bytes memory transaction = abi.encodePacked(
            bytesToSign,
            SIGNATURE_INITIALIZE_TX_R,
            SIGNATURE_INITIALIZE_TX_S,
            SIGNATURE_INITIALIZE_TX_V,
            INITIALIZE_TX_EFFECTIVE_PERCENTAGE
        );

        return transaction;
    }
}
