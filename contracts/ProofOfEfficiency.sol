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

    struct Sequencer {
        string sequencerURL;
        uint32 chainID;
    }

    struct BatchData {
        bytes32 batchHashData;
        uint256 maticCollateral;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // Default chainID
    uint32 public constant DEFAULT_CHAIN_ID = 1000;

    // MATIC token address
    IERC20 public immutable matic;

    // Mapping of registered sequencers
    mapping(address => Sequencer) public sequencers;

    // Current registered sequencers
    uint32 public numSequencers;

    // Last batch sent by the sequencers
    uint32 public lastBatchSent;

    // Mapping of sent batches with their associated data
    mapping(uint32 => BatchData) public sentBatches;

    // Last batch verified by the aggregators
    uint32 public lastVerifiedBatch;

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
        uint32 chainID
    );

    /**
     * @dev Emitted when a sequencer sends a new batch of transactions
     */
    event SendBatch(
        uint32 indexed numBatch,
        address indexed sequencer,
        uint32 batchChainID,
        bytes32 lastGlobalExitRoot
    );

    /**
     * @dev Emitted when a aggregator verifies a new batch
     */
    event VerifyBatch(uint32 indexed numBatch, address indexed aggregator);

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
     * @notice Allows to register a new sequencer or update the sequencer URL
     * @param sequencerURL sequencer RPC URL
     */
    function registerSequencer(string memory sequencerURL) public {
        require(
            bytes(sequencerURL).length != 0,
            "ProofOfEfficiency::registerSequencer: NOT_VALID_URL"
        );

        if (sequencers[msg.sender].chainID == 0) {
            // New sequencer is registered
            numSequencers++;
            sequencers[msg.sender].sequencerURL = sequencerURL;
            sequencers[msg.sender].chainID = DEFAULT_CHAIN_ID + numSequencers;
        } else {
            // Sequencer already exist, update the URL
            sequencers[msg.sender].sequencerURL = sequencerURL;
        }
        emit RegisterSequencer(
            msg.sender,
            sequencerURL,
            sequencers[msg.sender].chainID
        );
    }

    /**
     * @notice Allows a sequencer to send a batch of L2 transactions
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0, v, r, s)
     * @param maticAmount Max amount of MATIC tokens that the sequencer is willing to pay
     */
    function sendBatch(bytes memory transactions, uint256 maticAmount) public {
        // Calculate matic collateral
        uint256 maticCollateral = calculateSequencerCollateral();

        require(
            maticCollateral <= maticAmount,
            "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
        );

        matic.safeTransferFrom(msg.sender, address(this), maticCollateral);

        // Get globalExitRoot global exit root
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Set chainID
        uint32 batchChainID;
        if (sequencers[msg.sender].chainID != 0) {
            batchChainID = sequencers[msg.sender].chainID;
        } else {
            // If the sequencer is not registered use the default chainID
            batchChainID = DEFAULT_CHAIN_ID;
        }

        // Update sentBatches mapping
        lastBatchSent++;
        sentBatches[lastBatchSent].batchHashData = keccak256(
            abi.encodePacked(
                transactions,
                lastGlobalExitRoot,
                block.timestamp,
                msg.sender,
                batchChainID
            )
        );
        sentBatches[lastBatchSent].maticCollateral = maticCollateral;

        emit SendBatch(
            lastBatchSent,
            msg.sender,
            batchChainID,
            lastGlobalExitRoot
        );
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
        uint32 numBatch,
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
        BatchData memory currentBatch = sentBatches[numBatch];

        uint256 input = uint256(
            keccak256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    currentBatch.batchHashData,
                    numBatch
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
        matic.safeTransfer(msg.sender, currentBatch.maticCollateral);

        emit VerifyBatch(numBatch, msg.sender);
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateSequencerCollateral() public view returns (uint256) {
        return 1 ether * (1 + lastBatchSent - lastVerifiedBatch);
    }
}
