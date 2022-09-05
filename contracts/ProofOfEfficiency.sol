// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IGlobalExitRootManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue
 * THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
 * The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network
 * To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks
 */
contract ProofOfEfficiency is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which will be used to call sequenceBatches
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * @param globalExitRoot Global exit root of the batch
     * @param timestamp Timestamp of the batch
     * @param forceBatchesTimestamp Every element of the array indicates the timestamp of the forceBatch
     * that will be popped from the queue and added to the sequence
     */
    struct BatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64[] forceBatchesTimestamp;
    }

    /**
     * @notice Struct which will be stored in the sequence mapping
     * @param batchHashData Hash containing the necessary information to process a batch:
     * This field will contain: keccak256(bytes transactions || bytes32 globalExitRoot || address sequencer)
     * Note that in case of forceBatch, the previous hash is stored in the ForceBatches mapping, and this will remain empty
     * @param timestamp Timestamp of the batch
     * @param forceBatchNum Indicates which forceBatch is sequenced, 0 if it's a regular batch
     */
    struct SequencedBatch {
        bytes32 batchHashData; // This field will contain the hashed data including the transactions
        uint64 timestamp;
        uint64 forceBatchNum;
    }

    /**
     * @notice Struct which will be stored in the force batch mapping
     * @param batchHashData Hash containing the necessary information to process a batch:
     * This field will contain: keccak256(bytes transactions || bytes32 globalExitRoot || address sequencer)
     * @param maticFee Matic fee that will be payed to the aggregator
     * @param minTimestamp Timestamp that will be an down limit of the batch once this is added to the sequence
     */
    struct ForcedBatchData {
        bytes32 batchHashData;
        uint256 maticFee;
        uint64 minTimestamp;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // MATIC token address
    IERC20Upgradeable public matic;

    // trusted sequencer prover Fee
    uint256 public constant TRUSTED_SEQUENCER_FEE = 0.1 ether; // TODO should be defined

    // Max batch byte length
    uint256 public constant MAX_BATCH_LENGTH = type(uint256).max; // TODO should be defined

    // Force batch timeout
    uint64 public constant FORCE_BATCH_TIMEOUT = 7 days;

    // Byte length of the sha256 that will be used as a input of the snark
    // 8 Fields * 8 Bytes (Stark input in Field Array form) + 20 bytes (aggregator address)
    uint256 internal constant _SNARK_SHA_BYTES = 84;

    // Queue of forced batches with their associated data
    mapping(uint64 => ForcedBatchData) public forcedBatches;

    // Queue of batches that defines the virtual state
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

    // Indicates whether the force batch functionality is available
    bool public forceBatchAllowed;

    // Global Exit Root interface
    IGlobalExitRootManager public globalExitRootManager;

    // Current state root
    bytes32 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    bytes32 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Rollup verifier interface
    IVerifierRollup public rollupVerifier;

    // Trusted sequencer URL
    string public trustedSequencerURL;

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
     * @dev Emitted when a trusted sequencer update his address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when a trusted sequencer update the forcebatch boolean
     */
    event SetForceBatchAllowed(bool newForceBatchAllowed);

    /**
     * @dev Emitted when a trusted sequencer update his URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param genesisRoot rollup genesis root
     * @param _trustedSequencer trusted sequencer address
     * @param _forceBatchAllowed indicates wheather the force batch functionality is available
     * @param _trustedSequencerURL trusted sequencer URL
     */
    function initialize(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot,
        address _trustedSequencer,
        bool _forceBatchAllowed,
        string memory _trustedSequencerURL
    ) public initializer {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        currentStateRoot = genesisRoot;
        trustedSequencer = _trustedSequencer;
        forceBatchAllowed = _forceBatchAllowed;
        trustedSequencerURL = _trustedSequencerURL;
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
     * @notice Allows a sequencer to send multiple batches of L2 transactions
     * @param batches Struct array which the necessary data to append new batces ot the sequence
     * Global exit root, timestamp and forced batches that are pop from the queue
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
        uint64 currentTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Check Batch parameters are correct
            require(
                currentBatch.timestamp >= currentTimestamp &&
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
            currentTimestamp = currentBatch.timestamp;

            // Loop thorugh forceBatches
            for (
                uint256 j = 0;
                j < currentBatch.forceBatchesTimestamp.length;
                j++
            ) {
                currentLastForceBatchSequenced++;

                // Check timestamp is inside window
                uint64 currentForcedTimestamp = currentBatch
                    .forceBatchesTimestamp[j];

                require(
                    currentForcedTimestamp >= currentTimestamp &&
                        currentForcedTimestamp >=
                        forcedBatches[currentLastForceBatchSequenced]
                            .minTimestamp &&
                        currentForcedTimestamp <= block.timestamp,
                    "ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be inside range"
                );

                currentBatchSequenced++;
                // Add forceBatch to the sequence
                // Instead of adding the hashData, just add a "pointer" to the forced Batch
                sequencedBatches[currentBatchSequenced]
                    .forceBatchNum = currentLastForceBatchSequenced;
                sequencedBatches[currentBatchSequenced]
                    .timestamp = currentForcedTimestamp;

                // Update timestamp
                currentTimestamp = currentForcedTimestamp;
            }
        }

        // This check is done here just once for gas saving
        require(
            currentLastForceBatchSequenced <= lastForceBatch,
            "ProofOfEfficiency::sequenceBatches: Force batches overflow"
        );

        // Store back the storage variables
        lastTimestamp = currentTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequenceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allows an aggregator to verify a batch
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
        uint64 timestamp = sequencedBatches[numBatch].timestamp;
        bytes32 batchHashData;
        uint256 maticFee;

        // If it's a force batch, forcebatchNum indicates which one is, otherwise is a regular batch
        if (sequencedBatches[numBatch].forceBatchNum == 0) {
            batchHashData = sequencedBatches[numBatch].batchHashData;
            maticFee = TRUSTED_SEQUENCER_FEE;
        } else {
            ForcedBatchData memory currentForcedBatch = forcedBatches[
                sequencedBatches[numBatch].forceBatchNum
            ];
            batchHashData = currentForcedBatch.batchHashData;
            maticFee = currentForcedBatch.maticFee;
        }

        bytes32 inputStark = keccak256(
            abi.encodePacked(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                batchHashData,
                numBatch,
                timestamp
            )
        );

        bytes memory snarkHashBytes;
        assembly {
            // Set snarkHashBytes to the next free memory pointer
            snarkHashBytes := mload(0x40)

            // Reserve the memory. 32 for the length , the input bytes and 32
            // extra bytes at the end for word manipulation
            mstore(0x40, add(add(snarkHashBytes, 0x40), _SNARK_SHA_BYTES))

            // Set the actual length of the input bytes
            mstore(snarkHashBytes, _SNARK_SHA_BYTES)

            // Set the pointer at the beginning of the byte array
            let ptr := add(snarkHashBytes, 32)

            // store aggregator address
            mstore(ptr, shl(96, caller())) // 256 - 160 = 96
            ptr := add(ptr, 20)

            for {
                let i := 0
            } lt(i, 8) {
                i := add(i, 1)
            } {
                // Every iteration will write 4 bytes (32 bits) from inputStark padded to 8 bytes, in little endian format
                // First shift right i*32 bits, in order to have the next 4 bytes to write at the end of the byte array
                // Then shift left 256 - 32 (224) bits to the left.
                // As a result the first 4 bytes will be the next ones, and the rest of the bytes will be zeroes
                // Finally the result is shifted 32 bits for the padding, and stores in the current position of the pointer
                mstore(ptr, shr(32, shl(224, shr(mul(i, 32), inputStark))))
                ptr := add(ptr, 8) // write the next 8 bytes
            }
        }
        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [inputSnark]),
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

        // TODO Could delete batchData
        emit VerifyBatch(numBatch, msg.sender);
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions.
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
     * @param numForcedBatches number of forced batches that will be added to the sequence
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

            // Add forceBatch to the sequence
            // Instead of adding the hashData, just add a "pointer" to the forced Batch
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced]
                .forceBatchNum = currentLastForceBatchSequenced;
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

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the current trusted sequencer to allow/disallow the forceBatch functionality
     * @param newForceBatchAllowed Whether is allowed or not the forceBatch functionality
     */
    function setForceBatchAllowed(bool newForceBatchAllowed)
        public
        onlyTrustedSequencer
    {
        forceBatchAllowed = newForceBatchAllowed;

        emit SetForceBatchAllowed(newForceBatchAllowed);
    }

    /**
     * @notice Allow the trusted sequencer to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(string memory newTrustedSequencerURL)
        public
        onlyTrustedSequencer
    {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateForceProverFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }
}
