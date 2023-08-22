// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IPolygonRollupManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
abstract contract PolygonRollupManager is IPolygonRollupManager, Initializable {
    // struct to store consensus metadata?¿

    // Number of consensus added, every new consensus will be assigned sequencially a new ID
    uint256 public consensusCount;

    // Consensus mapping
    // consensusID => consensusImpl
    mapping(uint256 => address) public consensusMap;

    // Number of verifiers added, every new verifiers will be assigned sequencially a new ID
    uint256 public verifierCount;

    // Verifiers mapping
    // verifierID => verifierAddress
    mapping(uint256 => address) public verifierMap;

    // Governance address
    address public governance;

    // Governance address
    address public networkCount;

    // Time target of the verification of a batch
    // Adaptatly the batchFee will be updated to achieve this target
    uint64 public verifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    uint16 public multiplierBatchFee;

    // Trusted sequencer address
    address public trustedSequencer;

    // Current matic fee per batch sequenced
    uint256 public batchFee;

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

    struct ChainData {
        mapping(uint64 => SequencedBatchData) sequencedBatches;
        mapping(uint64 => bytes32) batchNumToStateRoot;
        mapping(uint256 => PendingState) pendingStateTransitions;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 lastPendingState;
        uint64 lastPendingStateConsolidated;
    }

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public pendingStateTimeout;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    uint64 public trustedAggregatorTimeout;

    /**
     * @dev Emitted when a new consensus is added
     */
    event AddNewConsensus(uint256 consensusID, address consensusAddress);

    /**
     * @dev Emitted when a new verifier is added
     */
    event AddNewVerifier(uint256 verifierID, address verifierAddress);

    function initialize(address _governance) external initializer {
        governance = _governance;
    }

    modifier onlyGovernance() {
        if (governance != msg.sender) {
            revert OnlyGovernance();
        }
        _;
    }

    /**
     * @notice Add a new consensus contract
     * @param newConsensusAddress new exit tree root
     */
    function addNewConsensus(
        address newConsensusAddress
    ) external onlyGovernance {
        uint256 consensusID = consensusCount++;
        consensusMap[consensusID] = newConsensusAddress;

        emit AddNewConsensus(consensusID, newConsensusAddress);
    }

    /**
     * @notice Add a new vefifier contract
     * @param newVerifierAddress new verifier address
     */
    function addNewVerifier(
        address newVerifierAddress
    ) external onlyGovernance {
        uint256 verifierID = verifierCount++;
        verifierMap[verifierID] = newVerifierAddress;

        emit AddNewVerifier(verifierID, newVerifierAddress);
    }

    /**
     * @notice Add a new vefifier contract
     * @param newVerifierAddress new verifier address
     */
    function createNewNetwork(
        address newVerifierAddress
    ) external onlyGovernance {
        uint256 verifierID = verifierCount++;
        verifierMap[verifierID] = newVerifierAddress;

        emit AddNewVerifier(verifierID, newVerifierAddress);
    }

    /**
     * @notice Add a new vefifier contract
     * @param newVerifierAddress new verifier address
     */
    function calculateCurrentRollupRoot(
        address newVerifierAddress
    ) external onlyGovernance {
        uint256 verifierID = verifierCount++;
        verifierMap[verifierID] = newVerifierAddress;

        emit AddNewVerifier(verifierID, newVerifierAddress);
    }
}
