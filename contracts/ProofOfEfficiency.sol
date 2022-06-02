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
        uint256 timestamp;
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

    // Queue of forced batches with their associated data
    mapping(uint64 => ForcedBatchData) public forcedBatches;

    // Queue of batches that define the virtual state
    mapping(uint64 => bytes32) public sequencedBatches;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last batch verified by the aggregators
    uint64 public lastVerifiedBatch;

    // Last batch sent by the sequencers
    uint64 public lastForceBatch;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last timestamp
    uint64 public lastTimestamp;

    // Global Exit Root address
    IGlobalExitRootManager public globalExitRootManager;

    // Current state root
    bytes32 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    bytes32 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

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
        address indexed sequencer,
        bytes32 lastGlobalExitRoot
    );

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
     * THis should be used only in extreme cases where the super sequencer does not work as expected
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(bytes memory transactions, uint256 maticAmount) public {
        // Calculate matic collateral
        uint256 maticFee = calculateForceProverFee();

        require(
            maticFee <= maticAmount,
            "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
        );

        require(
            transactions.length < MAX_BATCH_LENGTH,
            "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
        );

        matic.safeTransferFrom(msg.sender, address(this), maticFee);

        // Get globalExitRoot global exit root
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Update sequencedBatches mapping
        forcedBatches[lastForceBatch].batchHashData = keccak256(
            abi.encodePacked(
                transactions,
                lastGlobalExitRoot,
                uint64(block.timestamp),
                msg.sender
            )
        );
        forcedBatches[lastForceBatch].maticFee = maticFee;
        forcedBatches[lastForceBatch].timestamp = uint64(block.timestamp);

        emit ForceBatch(lastForceBatch, msg.sender, lastGlobalExitRoot);
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

        // Prepare to loop through sequences
        uint64 currenTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;

        // For every sequence, do the necessary checks and add it to the sequencedBatches mapping
        for (uint256 i = 0; i < sequencesNum; i++) {
            Sequence memory currentSequence = sequences[i];

            require(
                currentSequence.timestamp > currenTimestamp &&
                    currentSequence.timestamp < block.timestamp,
                "Timestamp must be inside range"
            );

            require(
                globalExitRootManager.globalExitRootMap(
                    currentSequence.globalExitRoot
                ) != 0,
                "Global Exit root must exist"
            );
            require(
                currentSequence.transactions.length < MAX_BATCH_LENGTH,
                "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
            );

            // Update sequencedBatches mapping
            currentBatchSequenced++;
            sequencedBatches[currentBatchSequenced] = keccak256(
                abi.encodePacked(
                    currentSequence.transactions,
                    currentSequence.globalExitRoot,
                    currentSequence.timestamp,
                    currentBatchSequenced, // should be removed
                    msg.sender
                )
            );
            currenTimestamp = currentSequence.timestamp;

            // Append forcedBatches too
            for (uint256 j = 0; j < currentSequence.forceBatchesNum; j++) {
                currentLastForceBatchSequenced++;

                // Get current forced batch
                ForcedBatchData storage currentForcedBatch = forcedBatches[
                    currentLastForceBatchSequenced
                ];

                // less than current tiemstamp
                // sequencer mess with timestamp, i'ts not ok
                require(
                    currentForcedBatch.timestamp > currenTimestamp,
                    "Must increase timestamp"
                );
                currenTimestamp = currentSequence.timestamp;

                sequencedBatches[currentBatchSequenced] = bytes32(
                    uint256(currentLastForceBatchSequenced)
                );
            }
        }

        require(
            lastForceBatch >= currentLastForceBatchSequenced,
            "Must increase timestamp"
        );

        lastTimestamp = currenTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;

        emit SequencedBatches(lastBatchSequenced); // TODO
    }

    // TODO
    // function sequencedForceBatch
    //    require(timeout == true)

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
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        bytes32 batchHashData = sequencedBatches[numBatch];
        uint256 maticFee = SUPER_SEQUENCER_FEE;

        if ((batchHashData >> 64) == 0) {
            // This is a forcedBatch
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
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateForceProverFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }
}
