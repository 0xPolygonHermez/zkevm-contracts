// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./interfaces/VerifierRollupInterface.sol";
import "./interfaces/BridgeInterface.sol";

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
        uint256 chainID;
    }

    struct BatchData {
        address sequencerAddress;
        bytes32 batchL2HashData;
        uint256 maticCollateral;
    }

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // Modulus zkSNARK
    uint256 private constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // MATIC token address
    IERC20 public immutable matic;

    // Mapping of registered sequencers
    mapping(address => Sequencer) public sequencers;

    // Current registered sequencers
    uint256 public numSequencers;

    // Last batch sent by the sequencers
    uint256 public lastBatchSent;

    // Mapping of sent batches with their associated data
    mapping(uint256 => BatchData) public sentBatches;

    // Last batch verified by the aggregators
    uint256 public lastVerifiedBatch;

    // Bridge address
    BridgeInterface public bridge;

    // Current state root
    bytes32 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    bytes32 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Last fetched global exit root, this will be updated every time a batch is verified
    bytes32 public lastGlobalExitRoot;

    VerifierRollupInterface public rollupVerifier;

    /**
     * @dev Emitted when a sequencer is registered or updated
     */
    event SetSequencer(address sequencerAddress, string sequencerURL);

    /**
     * @dev Emitted when a sequencer sends a new batch of transactions
     */
    event SendBatch(uint256 indexed batchNum, address indexed sequencer);

    /**
     * @dev Emitted when a aggregator verifies a new batch
     */
    event VerifyBatch(uint256 indexed batchNum, address indexed aggregator);

    /**
     * @param _bridge Bridge contract address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     */
    constructor(
        BridgeInterface _bridge,
        IERC20 _matic,
        VerifierRollupInterface _rollupVerifier
    ) {
        bridge = _bridge;
        matic = _matic;
        rollupVerifier = _rollupVerifier;

        // register this rollup and update the global exit root
        lastGlobalExitRoot = bridge.currentGlobalExitRoot();
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
            sequencers[msg.sender].chainID = numSequencers;
        } else {
            // Sequencer already exist, update the URL
            sequencers[msg.sender].sequencerURL = sequencerURL;
        }
        emit SetSequencer(msg.sender, sequencerURL);
    }

    /**
     * @notice Allows a sequencer to send a batch of L2 transactions
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0, v, r, s)
     * @param maticAmount Max amount of MATIC tokens that the sequencer is willing to pay
     */
    function sendBatch(bytes memory transactions, uint256 maticAmount) public {
        // calculate matic collateral
        uint256 maticCollateral = calculateSequencerCollateral();

        require(
            maticCollateral <= maticAmount,
            "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
        );

        matic.safeTransferFrom(msg.sender, address(this), maticCollateral);

        // Update sentBatches mapping
        lastBatchSent++;
        sentBatches[lastBatchSent].batchL2HashData = keccak256(transactions);
        sentBatches[lastBatchSent].maticCollateral = maticCollateral;

        // Check if the sequencer is registered, if not, no one will claim the fees
        if (sequencers[msg.sender].chainID != 0) {
            sentBatches[lastBatchSent].sequencerAddress = msg.sender;
        }

        emit SendBatch(lastBatchSent, msg.sender);
    }

    /**
     * @notice Allows an aggregator to verify a batch
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param batchNum Batch number that the aggregator intends to verify, used as a sanity check
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatch(
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256 batchNum,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public {
        // sanity check
        require(
            batchNum == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        // Calculate Circuit Input
        BatchData memory currentBatch = sentBatches[batchNum];
        address sequencerAddress = currentBatch.sequencerAddress; // could be 0, if sequencer is not registered
        uint256 batchChainID = sequencers[sequencerAddress].chainID; // could be 0, if sequencer is not registered
        uint256 input = uint256(
            sha256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    lastGlobalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    currentBatch.batchL2HashData,
                    batchChainID
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

        // Interact with bridge
        bridge.updateRollupExitRoot(currentLocalExitRoot);
        lastGlobalExitRoot = bridge.currentGlobalExitRoot();

        // Get MATIC reward
        matic.safeTransfer(msg.sender, currentBatch.maticCollateral);

        emit VerifyBatch(batchNum, msg.sender);
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateSequencerCollateral() public pure returns (uint256) {
        return 1 ether;
    }
}
