// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IGlobalExitRootManager.sol";

/**
 * Contract responsible for managing the state and the updates of it of the L2 Hermez network.
 * There will be sequencer, wich are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract ProofOfEfficiency is Ownable {
    using SafeERC20 for IERC20;

    struct Sequence {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64 forceBatchesNum;
    }

    struct ForcedBatchData {
        bytes32 batchHashData;
        uint256 maticFee;
        uint64 timestamp;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // Super sequencer prover Fee
    uint256 public constant PROVER_FEE = 1 ether; // TODO to be defined

    // MATIC token address
    IERC20 public immutable matic;

    // Constant fee that the super sequencer should pay to the aggregator
    uint64 public constant SUPER_SEQUENCER_FEE = 1 ether; // TODO should be defined

    // Max batch byte length
    uint64 public constant MAX_BATCH_LENGTH = 1 ether; // TODO should be defined

    // Force batch timeout
    uint64 public constant FORCE_BATCH_TIMEOUT = 7 days;

    // Queue of forced batches with their associated data
    mapping(uint64 => ForcedBatchData) public forcedBatches;

    // Queue of batches that define the virtual state
    mapping(uint64 => bytes32) public sequencedBatches;

    // Last timestamp
    uint64 public lastTimestamp;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last batch sent by the sequencers
    uint64 public lastForceBatch;

    // Last batch verified by the aggregators
    uint64 public lastVerifiedBatch;

    // Global Exit Root interface
    IGlobalExitRootManager public globalExitRootManager;

    // Current state root
    bytes32 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    bytes32 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Rollup verifier interface
    IVerifierRollup public rollupVerifier;

    /**
     * @dev Emitted when a sequencer is registered or updated
     */
    event RegisterSequencer(
        address sequencerAddress,
        string sequencerURL,
        uint64 chainID
    );

    /**
     * @dev Emitted when a sequencer sends a new batch of transactions
     */
    event SequencedBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a batch is forced
     */
    event ForceBatch(
        uint64 indexed numBatch,
        bytes32 lastGlobalExitRoot,
        bytes transactions
    );

    /**
     * @dev Emitted when a batch is forced
     */
    event ForceSequencedBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a aggregator verifies a new batch
     */
    event VerifyBatch(uint64 indexed numBatch, address indexed aggregator);

    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier addressv
     * @param genesisRoot rollup genesis root
     */
    constructor(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20 _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot
    ) {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        currentStateRoot = genesisRoot;
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions,
     * This tx can be front-runned by the sendBatches tx
     * This should be used only in extreme cases where the super sequencer does not work as expected
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(bytes memory transactions, uint256 maticAmount) public {
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

        // In order to avoid same timestamp in different batches if in the same block
        // Already happen a forcebatch, use the last timestamp used + 1
        // if (block.timestamp <= lastForcedTimestamp) {
        //     ++lastForcedTimestamp;
        //     timestamp = lastForcedTimestamp;
        // }
        uint64 timestamp = uint64(block.timestamp);

        // Update forcedBatches mapping
        lastForceBatch++;
        forcedBatches[lastForceBatch].batchHashData = keccak256(
            abi.encodePacked(
                transactions,
                lastGlobalExitRoot,
                timestamp,
                msg.sender
            )
        );
        forcedBatches[lastForceBatch].maticFee = maticFee;
        forcedBatches[lastForceBatch].timestamp = timestamp;

        // In order to avoid synch attacks, if the msg.sender is not the origin
        // Add the transaction bytes in the event
        if (msg.sender == tx.origin) {
            emit ForceBatch(lastForceBatch, lastGlobalExitRoot, "");
        } else {
            emit ForceBatch(lastForceBatch, lastGlobalExitRoot, transactions);
        }
    }

    /**
     * @notice Allows a sequencer to send a batch of L2 transactions
     * @param sequences L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     */
    function sequenceBatches(Sequence[] memory sequences) public onlyOwner {
        uint256 sequencesNum = sequences.length;

        // Pay collateral for every batch submitted
        // TODO should sequencer pay if there's no L2 batches to send but must send batch to sequence forcedBatches?
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            PROVER_FEE * sequencesNum
        );

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currenTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        for (uint256 i = 0; i < sequencesNum; i++) {
            // The timestmap upperlimit must be or the current block number, or the first timestamp of the forced tx
            uint64 upperLimitTimestamp;
            if (lastForceBatch > lastForceBatchSequenced) {
                upperLimitTimestamp = forcedBatches[lastForceBatchSequenced + 1]
                    .timestamp;
            } else {
                upperLimitTimestamp = uint64(block.timestamp);
            }

            // Load current sequence
            Sequence memory currentSequence = sequences[i];

            // Check Sequence parameters are correct
            require(
                currentSequence.timestamp > currenTimestamp &&
                    currentSequence.timestamp < upperLimitTimestamp,
                "ProofOfEfficiency::sequenceBatches: Timestamp must be inside range"
            );

            require(
                globalExitRootManager.globalExitRootMap(
                    currentSequence.globalExitRoot
                ) != 0,
                "ProofOfEfficiency::sequenceBatches: Global exit root must exist"
            );

            require(
                currentSequence.transactions.length < MAX_BATCH_LENGTH,
                "ProofOfEfficiency::sequenceBatches: Transactions bytes overflow"
            );

            // Update sequencedBatches mapping
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced] = keccak256(
                abi.encodePacked(
                    currentSequence.transactions,
                    currentSequence.globalExitRoot,
                    currentSequence.timestamp,
                    msg.sender
                )
            );

            // Append forcedBatches if any
            if (currentSequence.forceBatchesNum > 0) {
                // Loop thorugh forceBatches
                for (uint256 j = 0; j < currentSequence.forceBatchesNum; j++) {
                    currentLastForceBatchSequenced++;

                    // Instead of adding the hashData, just add a "pointer" to the forced Batch
                    currentBatchSequenced++;
                    sequencedBatches[currentBatchSequenced] = bytes32(
                        uint256(currentLastForceBatchSequenced)
                    );
                }
                // Update timestamp
                // The forced timestamp will always by higher than the sequenced timestamp
                currenTimestamp = forcedBatches[currentLastForceBatchSequenced]
                    .timestamp;
            } else {
                // Update timestamp
                currenTimestamp = currentSequence.timestamp;
            }
        }

        // Sanity check, this check is done here just once for gas saving
        require(
            lastForceBatch >= currentLastForceBatchSequenced,
            "ProofOfEfficiency::sequenceBatches: Force batches overflow"
        );

        // Store back the storage variables
        lastTimestamp = currenTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequencedBatches(lastBatchSequenced);
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
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        bytes32 batchHashData = sequencedBatches[numBatch];
        uint256 maticFee = SUPER_SEQUENCER_FEE;

        // The bachHashdata stores a pointer of a forceBatch instead of a hash
        if ((batchHashData >> 64) == 0) {
            // The bachHashdata stores a pointer of a forceBatch instead of a hash
            batchHashData = forcedBatches[uint64(uint256(batchHashData))]
                .batchHashData;
            maticFee = forcedBatches[uint64(uint256(batchHashData))].maticFee;
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
     * @notice Allows anyone to sequence forced Batches if the super sequencer do not have done it in the timeout period
     * @param numForcedBatch number of forced batches which the timeout of the super sequencer already expired
     */
    function sequenceForceBatches(uint64 numForcedBatch) public {
        require(
            lastForceBatchSequenced < numForcedBatch &&
                numForcedBatch <= lastForceBatch,
            "ProofOfEfficiency::sequenceForceBatch: Force batch invalid"
        );

        require(
            forcedBatches[numForcedBatch].timestamp + FORCE_BATCH_TIMEOUT >=
                block.timestamp,
            "ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period"
        );

        uint256 batchesToSequence = numForcedBatch - lastForceBatchSequenced;

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        // Sequence force batches
        for (uint256 j = 0; j < batchesToSequence; j++) {
            currentLastForceBatchSequenced++;
            // Instead of adding the hashData, just add a "pointer" to the forced Batch
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced] = bytes32(
                uint256(currentLastForceBatchSequenced)
            );
        }

        // Store back the storage variables
        lastTimestamp = forcedBatches[currentLastForceBatchSequenced].timestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit ForceSequencedBatches(lastBatchSequenced);
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateForceProverFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }
}
