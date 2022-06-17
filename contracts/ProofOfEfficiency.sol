// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IGlobalExitRootManager.sol";

/**
 * Contract responsible for managing the state and the updates of it of the L2 Hermez network.
 * There will be trusted sequencer, wich are able to send transactions.
 * Any user can force some transaction and the sequence will have a timeout to add them in the queue
 * THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
 * The aggregators will be able to actually verify the sequenced state with zkProofs and able withdraws from hermez L2
 * To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks
 */
contract ProofOfEfficiency {
    using SafeERC20 for IERC20;

    struct BatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64[] forceBatchesTimestamp;
    }

    struct ForcedBatchData {
        bytes32 batchHashData;
        uint256 maticFee;
        uint64 minTimestamp;
    }

    struct SequencedBatch {
        bytes32 batchHashData;
        uint64 timestamp;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // MATIC token address
    IERC20 public immutable matic;

    // trusted sequencer prover Fee
    uint256 public constant TRUSTED_SEQUENCER_FEE = 0.1 ether; // TODO should be defined

    // Max batch byte length
    uint256 public constant MAX_BATCH_LENGTH = type(uint256).max; // TODO should be defined

    // Force batch timeout
    uint64 public constant FORCE_BATCH_TIMEOUT = 7 days;

    // Queue of forced batches with their associated data
    mapping(uint64 => ForcedBatchData) public forcedBatches;

    // Queue of batches that define the virtual state
    mapping(uint64 => SequencedBatch) public sequencedBatches;

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

    // trusted sequencer address
    address public trustedSequencer;

    // Indicates wheather the force batch functionality is available
    bool public forceBatchAllowed;

    // Global Exit Root interface
    IGlobalExitRootManager public globalExitRootManager;

    // Current state root
    bytes32 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    bytes32 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Rollup verifier interface
    IVerifierRollup public rollupVerifier;

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
     * @dev Emitted when a aggregator verifies a new batch
     */
    event VerifyBatch(uint64 indexed numBatch, address indexed aggregator);

    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param genesisRoot rollup genesis root
     */
    constructor(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20 _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot,
        address _trustedSequencer,
        bool _forceBatchAllowed
    ) {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        currentStateRoot = genesisRoot;
        trustedSequencer = _trustedSequencer;
        forceBatchAllowed = _forceBatchAllowed;
    }

    modifier onlyTrustedSequencer() {
        require(
            trustedSequencer == msg.sender,
            "ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer"
        );
        _;
    }

    // Only for the current version
    modifier isForceBatchAllowed() {
        require(
            forceBatchAllowed == true,
            "ProofOfEfficiency::isForceBatchAllowed: only if force batch is available"
        );
        _;
    }

    /**
     * @notice Allows a sequencer to send a batch of L2 transactions
     * @param batches Struct array which contains, the transaction data
     * Global exit root, timestamp and forced batches that are pop form the queue
     */
    function sequenceBatches(BatchData[] memory batches)
        public
        onlyTrustedSequencer
    {
        uint256 batchesNum = batches.length;

        // Pay collateral for every batch submitted
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            TRUSTED_SEQUENCER_FEE * batchesNum
        );

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currenTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Check Sequence parameters are correct
            require(
                currentBatch.timestamp >= currenTimestamp &&
                    currentBatch.timestamp <= block.timestamp,
                "ProofOfEfficiency::sequenceBatches: Timestamp must be inside range"
            );

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
                "ProofOfEfficiency::sequenceBatches: Transactions bytes overflow"
            );

            // Update sequencedBatches mapping
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced].batchHashData = keccak256(
                abi.encodePacked(
                    currentBatch.transactions,
                    currentBatch.globalExitRoot,
                    msg.sender
                )
            );
            sequencedBatches[currentBatchSequenced].timestamp = currentBatch
                .timestamp;

            // Update timestamp
            currenTimestamp = currentBatch.timestamp;

            // Loop thorugh forceBatches
            for (
                uint256 j = 0;
                j < currentBatch.forceBatchesTimestamp.length;
                j++
            ) {
                // Check timestamp is inside window
                uint64 currentForcedTimestamp = currentBatch
                    .forceBatchesTimestamp[j];

                currentLastForceBatchSequenced++;

                require(
                    currentForcedTimestamp >= currenTimestamp &&
                        currentForcedTimestamp >=
                        forcedBatches[currentLastForceBatchSequenced]
                            .minTimestamp &&
                        currentForcedTimestamp <= block.timestamp,
                    "ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be inside range"
                );

                // Instead of adding the hashData, just add a "pointer" to the forced Batch
                // Could simply update the forceBatch array
                currentBatchSequenced++;
                sequencedBatches[currentBatchSequenced].batchHashData = bytes32(
                    uint256(currentLastForceBatchSequenced)
                );
                sequencedBatches[currentBatchSequenced]
                    .timestamp = currentForcedTimestamp;

                // Update timestamp
                currenTimestamp = currentForcedTimestamp;
            }
        }

        // Sanity check, this check is done here just once for gas saving
        require(
            currentLastForceBatchSequenced <= lastForceBatch,
            "ProofOfEfficiency::sequenceBatches: Force batches overflow"
        );

        // Store back the storage variables
        lastTimestamp = currenTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequenceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allows an aggregator to verify a batch
     * @notice If not exist the batch, the circuit will not be able to match the hash image of 0
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param numBatch Batch number that the aggregator intends to verify, used as a sanity check
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatch(
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint64 numBatch,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public {
        // sanity check
        require(
            numBatch == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: batch does not match"
        );

        require(
            numBatch <= lastBatchSequenced,
            "ProofOfEfficiency::verifyBatch: batch does not have been sequenced"
        );

        // Calculate Circuit Input
        bytes32 batchHashData = sequencedBatches[numBatch].batchHashData;
        uint256 maticFee = TRUSTED_SEQUENCER_FEE;
        uint64 timestamp = sequencedBatches[numBatch].timestamp;

        // The bachHashData stores a pointer of a forceBatch instead of a hash
        if ((batchHashData >> 64) == 0) {
            // The bachHashData stores a pointer of a forceBatch instead of a hash
            ForcedBatchData memory currentForcedBatch = forcedBatches[
                uint64(uint256(batchHashData))
            ];
            batchHashData = currentForcedBatch.batchHashData;
            maticFee = currentForcedBatch.maticFee;
        }

        uint256 input = uint256(
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    batchHashData,
                    numBatch,
                    timestamp,
                    msg.sender // Front-running protection
                )
            )
        ) % _RFIELD;

        // Verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [input]),
            "ProofOfEfficiency::verifyBatch: INVALID_PROOF"
        );

        // Update state
        lastVerifiedBatch++;
        currentStateRoot = newStateRoot;
        currentLocalExitRoot = newLocalExitRoot;

        // Interact with globalExitRoot
        globalExitRootManager.updateExitRoot(currentLocalExitRoot);

        // Get MATIC reward
        matic.safeTransfer(msg.sender, maticFee);

        // delete batchData
        emit VerifyBatch(numBatch, msg.sender);
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions,
     * This tx can be front-runned by the trusted sequencer
     * This should be used only in extreme cases where the trusted sequencer does not work as expected
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(bytes memory transactions, uint256 maticAmount)
        public
        isForceBatchAllowed
    {
        // Calculate matic collateral
        uint256 maticFee = calculateForceProverFee();

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
        forcedBatches[lastForceBatch].batchHashData = keccak256(
            abi.encodePacked(transactions, lastGlobalExitRoot, msg.sender)
        );
        forcedBatches[lastForceBatch].maticFee = maticFee;
        forcedBatches[lastForceBatch].minTimestamp = uint64(block.timestamp);

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
     * Also allow in any time the trusted sequencer to append forceBatches to the sequence in order to avoid timeout issues
     * @param numForcedBatches number of forced batches tha will be added to the queue
     */
    function sequenceForceBatches(uint64 numForcedBatches)
        public
        isForceBatchAllowed
    {
        uint64 newLastForceBatchSequenced = lastForceBatchSequenced +
            numForcedBatches;

        require(
            numForcedBatches > 0,
            "ProofOfEfficiency::sequenceForceBatch: Must force at least 1 batch"
        );

        require(
            newLastForceBatchSequenced <= lastForceBatch,
            "ProofOfEfficiency::sequenceForceBatch: Force batch invalid"
        );

        // If message sender is not the trusted sequencer, must wait the timeout
        if (msg.sender != trustedSequencer) {
            // The last batch will have the most restrictive timestamp
            require(
                forcedBatches[newLastForceBatchSequenced].minTimestamp +
                    FORCE_BATCH_TIMEOUT <=
                    block.timestamp,
                "ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period"
            );
        }

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        // Sequence force batches
        for (uint256 j = 0; j < numForcedBatches; j++) {
            currentLastForceBatchSequenced++;
            // Instead of adding the hashData, just add a "pointer" to the forced Batch
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced].batchHashData = bytes32(
                uint256(currentLastForceBatchSequenced)
            );
            sequencedBatches[currentBatchSequenced].timestamp = uint64(
                block.timestamp
            );
        }

        // Store back the storage variables
        lastTimestamp = uint64(block.timestamp);
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequenceForceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allow the current trusted sequencer to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequuencer
     */
    function setTrustedSequencer(address newTrustedSequencer)
        public
        onlyTrustedSequencer
    {
        trustedSequencer = newTrustedSequencer;
    }

    /**
     * @notice Allow the current trusted sequencer to allow/disallow the forceBatch functionality
     * @param _forceBatchAllowed Whether is allowed or not the forceBatch functionality
     */
    function setForceBatchAllowed(bool _forceBatchAllowed)
        public
        onlyTrustedSequencer
    {
        forceBatchAllowed = _forceBatchAllowed;
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateForceProverFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }
}
