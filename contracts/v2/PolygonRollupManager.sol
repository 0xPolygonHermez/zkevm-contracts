// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IPolygonRollupManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IPolygonZkEVMGlobalExitRoot.sol";
import "../interfaces/IPolygonZkEVMBridge.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./PolygonZkEVMV2.sol";
import "../lib/EmergencyManager.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

//roles TODO

/**
 * Contract responsible for managing the exit roots across multiple Rollups
 */
abstract contract PolygonRollupManager is
    IPolygonRollupManager,
    Initializable,
    EmergencyManager
{
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
     * @notice Struct which to store the verifier data
     * @param accInputHash Hash chain that contains all the information to process a batch:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     * @param previousLastBatchSequenced Previous last batch sequenced before the current one, this is used to properly calculate the fees
     */
    struct VerifierData {
        uint64 verifierID;
        uint64 forkID;
        string description;
    }

    /**
     * @notice Struct which to store the verifier data
     * @param accInputHash Hash chain that contains all the information to process a batch:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     * @param previousLastBatchSequenced Previous last batch sequenced before the current one, this is used to properly calculate the fees
     */
    struct ConsensusData {
        uint64 consensusID;
        string description;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param accInputHash Hash chain that contains all the information to process a batch:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     * @param previousLastBatchSequenced Previous last batch sequenced before the current one, this is used to properly calculate the fees
     */
    struct RollupData {
        address rollupAddress;
        IVerifierRollup verifierAddress; // address?¿
        uint64 chainID;
        mapping(uint64 => SequencedBatchData) sequencedBatches;
        mapping(uint64 => bytes32) batchNumToStateRoot;
        mapping(uint256 => PendingState) pendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 lastPendingState;
        uint64 lastPendingStateConsolidated;
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

    // Maximum batches that can be verified in one call. It depends on our current metrics
    // This should be a protection against someone that tries to generate huge chunk of invalid batches, and we can't prove otherwise before the pending timeout expires
    uint64 internal constant _MAX_VERIFY_BATCHES = 1000;

    // If a sequenced batch exceeds this timeout without being verified, the contract enters in emergency mode
    uint64 internal constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Goldilocks prime field
    uint256 internal constant _GOLDILOCKS_PRIME_FIELD = 0xFFFFFFFF00000001; // 2 ** 64 - 2 ** 32 + 1

    // Max uint64
    uint256 internal constant _MAX_UINT_64 = type(uint64).max; // 0xFFFFFFFFFFFFFFFF

    // Exit merkle tree levels
    uint256 internal constant _EXIT_TREE_DEPTH = 32;

    // Global Exit Root interface
    IPolygonZkEVMGlobalExitRoot public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // TODO struct to store consensus metadata?¿ and also for the vierifer

    // Number of consensus added, every new consensus will be assigned sequencially a new ID
    uint64 public consensusCount;

    // Consensus mapping
    // consensus address => consensus Implementation
    mapping(address => ConsensusData) public consensusMap;

    // Number of verifiers added, every new verifier will be assigned sequencially a new ID
    uint64 public verifierCount;

    // Verifiers mapping
    // verifierID => verifierAddress
    mapping(address => VerifierData) public verifierMap;

    // Rollup Count
    uint64 public rollupCount;

    // Rollups mapping
    // RollupID => Rollup Data
    mapping(uint64 => RollupData) public rollupIDToRollupData;

    // Rollups mapping
    // RollupAddress => rollupID
    mapping(address => uint64) public rollupAddressToID;

    // Trusted aggregator for all the Rollups
    address public trustedAggregator;

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public pendingStateTimeout;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    uint64 public trustedAggregatorTimeout;

    // Governance address
    address public governance; // two steps governance

    // This account will be able to accept the governance role
    address public pendingGovernance;

    /**
     * @dev Emitted when a new consensus is added
     */
    event AddNewConsensus(
        uint256 consensusID,
        address consensusAddress,
        string description
    );

    /**
     * @dev Emitted when a new consensus is added
     */
    event AddNewVerifier(
        uint256 verifierId,
        address verifierAddress,
        string description
    );

    /**
     * @dev Emitted when a new verifier is added
     */
    event DeleteConsensus(address consensusAddress);

    /**
     * @dev Emitted when a new verifier is added
     */
    event DeleteVerifier(address verifierAddress);

    /**
     * @dev Emitted when a new verifier is added
     */
    event AddNewRollup(
        address rollupAddress,
        address consensusAddress,
        address verifierAddress,
        uint64 chainID
    );

    /**
     * @dev Emitted when a new verifier is added
     */
    event RollupUpgraded(address rollupAddress, address newConsensusAddress);

    /**
     * @dev Emitted when a new verifier is added
     */
    event OnSequenceBatches(
        uint64 newSequencedBatch,
        bytes32 newAccInputHash,
        uint64 rollupID
    );

    /**
     * @dev Emitted when a aggregator verifies batches
     */
    event VerifyBatches(
        uint64 rollupID,
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when a aggregator verifies batches
     */
    event VerifyBatchesTrustedAggregator(
        uint64 rollupID,
        uint64 indexed numBatch,
        bytes32 stateRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when pending state is consolidated
     */
    event ConsolidatePendingState(
        uint64 rollupID,
        uint64 indexed numBatch,
        bytes32 stateRoot,
        uint64 indexed pendingStateNum
    );

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
     * @dev Emitted when the governance starts the two-step transfer role setting a new pending governance
     */
    event TransferGovernanceRole(address newPendingGovernance);

    /**
     * @dev Emitted when the pending Governance accepts the Governance role
     */
    event AcceptGovernanceRole(address newGovernance);

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _bridgeAddress Bridge address
     */
    constructor(
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        IPolygonZkEVMBridge _bridgeAddress
    ) {
        globalExitRootManager = _globalExitRootManager;
        bridgeAddress = _bridgeAddress;
    }

    function initialize(
        address _governance,
        uint64 _pendingStateTimeout,
        address _trustedAggregator,
        uint64 _trustedAggregatorTimeout
    ) external initializer {
        governance = _governance;
        trustedAggregator = _trustedAggregator;

        // Check initialize parameters
        if (_pendingStateTimeout > _HALT_AGGREGATION_TIMEOUT) {
            revert PendingStateTimeoutExceedHaltAggregationTimeout();
        }
        pendingStateTimeout = _pendingStateTimeout;

        if (_trustedAggregatorTimeout > _HALT_AGGREGATION_TIMEOUT) {
            revert TrustedAggregatorTimeoutExceedHaltAggregationTimeout();
        }

        trustedAggregatorTimeout = _trustedAggregatorTimeout;

        // Initialize OZ contracts
        //__Ownable_init_unchained();
    }

    modifier onlyGovernance() {
        if (governance != msg.sender) {
            revert OnlyGovernance();
        }
        _;
    }

    modifier onlyTrustedAggregator() {
        if (trustedAggregator != msg.sender) {
            revert OnlyTrustedAggregator();
        }
        _;
    }

    /**
     * @notice Add a new consensus implementation contract
     * This contract will be used as base for the new created Rollups
     * @param newConsensusAddress new exit tree root
     * @param description description of the consensus
     */
    function addNewConsensus(
        address newConsensusAddress,
        string memory description
    ) external onlyGovernance {
        if (consensusMap[newConsensusAddress].consensusID != 0) {
            revert ConsensusAlreadyExist();
        }

        uint64 consensusID = consensusCount++;
        consensusMap[newConsensusAddress] = ConsensusData({
            consensusID: consensusID,
            description: description
        });
        // Check a view on the consensus contract?¿

        emit AddNewConsensus(consensusID, newConsensusAddress, description);
    }

    /**
     * @notice Add a new vefifier contract
     * @param newVerifierAddress new verifier address
     */
    function addNewVerifier(
        address newVerifierAddress,
        uint64 forkID,
        string memory description
    ) external onlyGovernance {
        if (verifierMap[newVerifierAddress].verifierID == 0) {
            revert VerifierAlreadyExist();
        }

        uint64 verifierID = verifierCount++;
        verifierMap[newVerifierAddress] = VerifierData({
            verifierID: verifierID,
            forkID: forkID,
            description: description
        });

        emit AddNewVerifier(verifierID, newVerifierAddress, description);
    }

    /**
     * @notice Delete Conensus
     * @param consensusAddress Consensus address to delete
     */
    function deleteConsensus(address consensusAddress) external onlyGovernance {
        if (consensusMap[consensusAddress].consensusID == 0) {
            revert ConsensusDoesNotExist();
        }

        delete consensusMap[consensusAddress].description;
        delete consensusMap[consensusAddress];

        emit DeleteConsensus(consensusAddress);
    }

    /**
     * @notice Delete Verifier
     * @param verifierAddress Verifier address to delete
     */
    function deleteVerifier(address verifierAddress) external onlyGovernance {
        if (verifierMap[verifierAddress].verifierID != 0) {
            revert VerifierDoesNotExist();
        }

        delete verifierMap[verifierAddress].description;
        delete verifierMap[verifierAddress];

        emit DeleteVerifier(verifierAddress);
    }

    /**
     * @notice Create a new rollup
     * @param consensusAddress consensus implementation address
     * @param verifierAddress chainID
     * @param _admin admin of the new created rollup
     * @param _trustedSequencer trusted sequencer of the new created rollup
     * @param _feeToken fee token of the new created rollup
     * @param _trustedSequencerURL trusted sequencer URL of the new created rollup
     * @param _networkName network name of the new created rollup
     * @param _version version string of the new created rollup
     */
    function createNewRollup(
        address consensusAddress,
        address verifierAddress,
        uint64 chainID,
        address _admin,
        address _trustedSequencer,
        IERC20Upgradeable _feeToken,
        string memory _trustedSequencerURL,
        string memory _networkName,
        string calldata _version
    ) external onlyGovernance {
        if (consensusMap[consensusAddress].consensusID == 0) {
            revert ConsensusDoesNotExist();
        }

        if (verifierMap[verifierAddress].verifierID != 0) {
            revert VerifierDoesNotExist();
        }

        uint64 rollupID = rollupCount++;

        // Create a proxy, with the consensus as a implementation, and the governance as admin
        address rollupAddress = address(
            new TransparentUpgradeableProxy(
                consensusAddress,
                governance,
                abi.encodeCall(
                    PolygonZkEVMV2.initialize,
                    (
                        _admin,
                        _trustedSequencer,
                        _feeToken,
                        _trustedSequencerURL,
                        _networkName,
                        _version,
                        rollupID
                    ) //  TODO Make lib about, like basePolygonRollup
                )
            )
        );

        rollupAddressToID[rollupAddress] = rollupID;

        RollupData storage rollup = rollupIDToRollupData[rollupID];
        rollup.rollupAddress = rollupAddress;
        rollup.verifierAddress = IVerifierRollup(verifierAddress);
        rollup.chainID = chainID;

        emit AddNewRollup(
            rollupAddress,
            consensusAddress,
            verifierAddress,
            chainID
        );
    }

    // Add existing rollup, case of zkEVM, could even be hardcoded?¿

    /**
     * @notice Add a new vefifier contract
     * @param rollupAddress rollup address
     * @param verifierAddress verifier address, must be added before
     * @param chainID chain id of the created rollup
     */
    function addExistingRollup(
        address rollupAddress,
        address verifierAddress,
        uint64 chainID
    ) external onlyGovernance {
        uint64 rollupID = rollupCount++;

        rollupAddressToID[rollupAddress] = rollupID;

        RollupData storage rollup = rollupIDToRollupData[rollupID];
        rollup.rollupAddress = rollupAddress;
        rollup.verifierAddress = IVerifierRollup(verifierAddress);
        rollup.chainID = chainID;

        emit AddNewRollup(rollupAddress, address(0), verifierAddress, chainID);
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupAddress Rollup consensus proxy address
     * @param newConsensusAddress new implementation of the consensus
     * @param upgradeData Upgrade data
     */
    function upgradeRollupImplementation(
        TransparentUpgradeableProxy rollupAddress,
        address newConsensusAddress,
        bytes calldata upgradeData
    ) external onlyGovernance {
        if (consensusMap[newConsensusAddress].consensusID == 0) {
            revert ConsensusDoesNotExist();
        }

        if (rollupAddress.implementation() == newConsensusAddress) {
            revert UpgradeToSameImplementation();
        }

        rollupAddress.upgradeToAndCall(newConsensusAddress, upgradeData);

        emit RollupUpgraded(address(rollupAddress), newConsensusAddress);
    }

    /**
     * @notice Add a new vefifier contract
     * @param newVerifierAddress new verifier address
     */
    function upgradeRollupVerifier(
        address rollupAddress,
        IVerifierRollup newVerifierAddress
    ) external onlyGovernance {
        uint64 rollupID = rollupAddressToID[rollupAddress];

        if (rollupID == 0) {
            revert RollupMustExist();
        }

        if (verifierMap[address(newVerifierAddress)].verifierID != 0) {
            revert VerifierDoesNotExist();
        }

        RollupData storage rollup = rollupIDToRollupData[rollupID];

        if (rollup.verifierAddress == newVerifierAddress) {
            revert VerifierMustBeDifferent();
        }

        rollup.verifierAddress = newVerifierAddress;

        emit RollupUpgraded(rollupAddress, address(newVerifierAddress));
    }

    // Since it's expected to have no more than 4-5 levels, this approach is good enough
    // In a future this computation will be done inside the circuit

    /**
     * @notice get the current rollup exit root
     */
    function getRollupExitRoot() public view returns (bytes32) {
        uint256 currentNodes = rollupCount;

        // if there are no nodes return 0
        if (currentNodes == 0) {
            return bytes32(0);
        }

        uint256 levelsToCompute;
        while ((currentNodes >> levelsToCompute) > 0) {
            levelsToCompute++;
        }

        // This array will contain the nodes of the current iteration
        bytes32[] memory tmpTree = new bytes32[](currentNodes);

        // In the first iteration the nodes will be the leafs which are the local exit roots of each network
        for (uint256 i = 0; i < currentNodes; i++) {
            tmpTree[i] = rollupIDToRollupData[uint64(i)].lastLocalExitRoot;
        }

        // This variable will keep track of the zero hashes
        bytes32 currentZeroHashHeight = 0;

        // Calculate the root of the sub-tree that contains all the localExitRoots
        while (tmpTree.length != 1) {
            uint256 nextIterationNodes = currentNodes / 2 + (currentNodes % 2);
            bytes32[] memory nextTmpTree = new bytes32[](nextIterationNodes);
            for (uint256 i = 0; i < nextIterationNodes; i++) {
                // if we are on the last iteration of the current level and the nodes are odd
                if (i == nextIterationNodes - 1 && (currentNodes % 2) == 1) {
                    nextTmpTree[i] = keccak256(
                        abi.encodePacked(tmpTree[i * 2], currentZeroHashHeight)
                    );
                } else {
                    nextTmpTree[i] = keccak256(
                        abi.encodePacked(tmpTree[i * 2], tmpTree[(i * 2) + 1])
                    );
                }
            }

            // update tmpTrees
            tmpTree = nextTmpTree;
            currentNodes = nextIterationNodes;
            currentZeroHashHeight = keccak256(
                abi.encodePacked(currentZeroHashHeight, currentZeroHashHeight)
            );
        }
        bytes32 currentRoot = tmpTree[0];
        uint256 remainingLevels = _EXIT_TREE_DEPTH - levelsToCompute;

        // Calculate remaining levels, since it's a sequencial merkle tree, the rest of the tree is zeroes
        for (uint256 i = 0; i < remainingLevels; i++) {
            currentRoot = keccak256(
                abi.encodePacked(currentRoot, currentZeroHashHeight)
            );
            currentZeroHashHeight = keccak256(
                abi.encodePacked(currentZeroHashHeight, currentZeroHashHeight)
            );
        }
        return currentRoot;
    }

    /////////////////////////////////////
    // Sequence/Verify batches functions
    ////////////////////////////////////

    /**
     * @notice Sequence batches, callback called by one of the consensus managed by this contract
     * @param newSequencedBatch new sequenced batch
     * @param newAccInputHash new accumualted input hash
     */
    function onSequenceBatches(
        uint64 newSequencedBatch,
        bytes32 newAccInputHash
    ) external {
        // Get current Rollup
        uint64 rollupID = rollupAddressToID[msg.sender];

        if (rollupID == 0) {
            revert SenderMustBeRollup();
        }

        RollupData storage rollup = rollupIDToRollupData[rollupID];

        if (newSequencedBatch <= rollup.lastBatchSequenced) {
            revert NewSequencedBatchMustBeBigger();
        }
        // Update rollup data with the new sequence
        rollup.sequencedBatches[newSequencedBatch] = SequencedBatchData({
            accInputHash: newAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: rollup.lastBatchSequenced
        });
        rollup.lastBatchSequenced = newSequencedBatch;

        emit OnSequenceBatches(newSequencedBatch, newAccInputHash, rollupID);
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function verifyBatches(
        uint64 rollupID,
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external ifNotEmergencyState {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        // Check if the trusted aggregator timeout expired,
        // Note that the sequencedBatches struct must exists for this finalNewBatch, if not newAccInputHash will be 0
        if (
            rollup.sequencedBatches[finalNewBatch].sequencedTimestamp +
                trustedAggregatorTimeout >
            block.timestamp
        ) {
            revert TrustedAggregatorTimeoutNotExpired();
        }

        if (finalNewBatch - initNumBatch > _MAX_VERIFY_BATCHES) {
            revert ExceedMaxVerifyBatches();
        }

        _verifyAndRewardBatches(
            rollup,
            pendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        if (pendingStateTimeout == 0) {
            // Consolidate state
            rollup.lastVerifiedBatch = finalNewBatch;
            rollup.batchNumToStateRoot[finalNewBatch] = newStateRoot;
            rollup.lastLocalExitRoot = newLocalExitRoot;

            // Clean pending state if any
            if (rollup.lastPendingState > 0) {
                rollup.lastPendingState = 0;
                rollup.lastPendingStateConsolidated = 0;
            }

            // Interact with globalExitRootManager
            globalExitRootManager.updateExitRoot(getRollupExitRoot());
        } else {
            // Consolidate pending state if possible
            _tryConsolidatePendingState(rollup);

            // Update pending state
            rollup.lastPendingState++;
            rollup.pendingStateTransitions[
                rollup.lastPendingState
            ] = PendingState({
                timestamp: uint64(block.timestamp),
                lastVerifiedBatch: finalNewBatch,
                exitRoot: newLocalExitRoot,
                stateRoot: newStateRoot
            });
        }

        emit VerifyBatches(rollupID, finalNewBatch, newStateRoot, msg.sender);
    }

    /**
     * @notice Allows an aggregator to verify multiple batches
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function verifyBatchesTrustedAggregator(
        uint64 rollupID,
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external onlyTrustedAggregator {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        _verifyAndRewardBatches(
            rollup,
            pendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        // Consolidate state
        rollup.lastVerifiedBatch = finalNewBatch;
        rollup.batchNumToStateRoot[finalNewBatch] = newStateRoot;
        rollup.lastLocalExitRoot = newLocalExitRoot;

        // Clean pending state if any
        if (rollup.lastPendingState > 0) {
            rollup.lastPendingState = 0;
            rollup.lastPendingStateConsolidated = 0;
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        emit VerifyBatchesTrustedAggregator(
            rollupID,
            finalNewBatch,
            newStateRoot,
            msg.sender
        );
    }

    /**
     * @notice Verify and reward batches internal function
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function _verifyAndRewardBatches(
        RollupData storage rollup,
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) internal virtual {
        bytes32 oldStateRoot;
        uint64 currentLastVerifiedBatch = _getLastVerifiedBatch(rollup);

        // Use pending state if specified, otherwise use consolidated state
        if (pendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            if (pendingStateNum > rollup.lastPendingState) {
                revert PendingStateDoesNotExist();
            }

            // Check choosen pending state
            PendingState storage currentPendingState = rollup
                .pendingStateTransitions[pendingStateNum];

            // Get oldStateRoot from pending batch
            oldStateRoot = currentPendingState.stateRoot;

            // Check initNumBatch matches the pending state
            if (initNumBatch != currentPendingState.lastVerifiedBatch) {
                revert InitNumBatchDoesNotMatchPendingState();
            }
        } else {
            // Use consolidated state
            oldStateRoot = rollup.batchNumToStateRoot[initNumBatch];

            if (oldStateRoot == bytes32(0)) {
                revert OldStateRootDoesNotExist();
            }

            // Check initNumBatch is inside the range, sanity check
            if (initNumBatch > currentLastVerifiedBatch) {
                revert InitNumBatchAboveLastVerifiedBatch();
            }
        }

        // Check final batch
        if (finalNewBatch <= currentLastVerifiedBatch) {
            revert FinalNumBatchBelowLastVerifiedBatch();
        }

        // Get snark bytes
        bytes memory snarkHashBytes = _getInputSnarkBytes(
            rollup,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        if (!rollup.verifierAddress.verifyProof(proof, [inputSnark])) {
            revert InvalidProof();
        }

        PolygonZkEVMV2(rollup.rollupAddress).verifyAndRewardBatches(
            msg.sender,
            (finalNewBatch - currentLastVerifiedBatch)
        );
    }

    /**
     * @notice Internal function to consolidate the state automatically once sequence or verify batches are called
     * It tries to consolidate the first and the middle pending state in the queue
     */
    function _tryConsolidatePendingState(RollupData storage rollup) internal {
        // Check if there's any state to consolidate
        if (rollup.lastPendingState > rollup.lastPendingStateConsolidated) {
            // Check if it's possible to consolidate the next pending state
            uint64 nextPendingState = rollup.lastPendingStateConsolidated + 1;
            if (_isPendingStateConsolidable(rollup, nextPendingState)) {
                // Check middle pending state ( binary search of 1 step)
                uint64 middlePendingState = nextPendingState +
                    (rollup.lastPendingState - nextPendingState) /
                    2;

                // Try to consolidate it, and if not, consolidate the nextPendingState
                if (_isPendingStateConsolidable(rollup, middlePendingState)) {
                    _consolidatePendingState(rollup, middlePendingState);
                } else {
                    _consolidatePendingState(rollup, nextPendingState);
                }
            }
        }
    }

    /**
     * @notice Allows to consolidate any pending state that has already exceed the pendingStateTimeout
     * Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions
     * @param pendingStateNum Pending state to consolidate
     */
    function consolidatePendingState(
        uint64 rollupID,
        uint64 pendingStateNum
    ) external {
        RollupData storage rollup = rollupIDToRollupData[rollupID];
        // Check if pending state can be consolidated
        // If trusted aggregator is the sender, do not check the timeout or the emergency state
        if (msg.sender != trustedAggregator) {
            if (isEmergencyState) {
                revert OnlyNotEmergencyState();
            }

            if (!_isPendingStateConsolidable(rollup, pendingStateNum)) {
                revert PendingStateNotConsolidable();
            }
        }
        _consolidatePendingState(rollup, pendingStateNum);
    }

    /**
     * @notice Internal function to consolidate any pending state that has already exceed the pendingStateTimeout
     * @param pendingStateNum Pending state to consolidate
     */
    function _consolidatePendingState(
        RollupData storage rollup,
        uint64 pendingStateNum
    ) internal {
        // Check if pendingStateNum is in correct range
        // - not consolidated (implicity checks that is not 0)
        // - exist ( has been added)
        if (
            pendingStateNum <= rollup.lastPendingStateConsolidated ||
            pendingStateNum > rollup.lastPendingState
        ) {
            revert PendingStateInvalid();
        }

        PendingState storage currentPendingState = rollup
            .pendingStateTransitions[pendingStateNum];

        // Update state
        uint64 newLastVerifiedBatch = currentPendingState.lastVerifiedBatch;
        rollup.lastVerifiedBatch = newLastVerifiedBatch;
        rollup.batchNumToStateRoot[newLastVerifiedBatch] = currentPendingState
            .stateRoot;

        // Update pending state
        rollup.lastPendingStateConsolidated = pendingStateNum;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(currentPendingState.exitRoot);

        emit ConsolidatePendingState(
            rollupAddressToID[rollup.rollupAddress],
            newLastVerifiedBatch,
            currentPendingState.stateRoot,
            pendingStateNum
        );
    }

    /////////////////////////////////
    // Soundness protection functions
    /////////////////////////////////

    /**
     * @notice Allows the trusted aggregator to override the pending state
     * if it's possible to prove a different state root given the same batches
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function overridePendingState(
        uint64 rollupID,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external onlyTrustedAggregator {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        _proveDistinctPendingState(
            rollup,
            initPendingStateNum,
            finalPendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        // Consolidate state state
        rollup.lastVerifiedBatch = finalNewBatch;
        rollup.batchNumToStateRoot[finalNewBatch] = newStateRoot;
        rollup.lastLocalExitRoot = newLocalExitRoot;

        // Clean pending state if any
        if (rollup.lastPendingState > 0) {
            rollup.lastPendingState = 0;
            rollup.lastPendingStateConsolidated = 0;
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

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
     * @param proof fflonk proof
     */
    function proveNonDeterministicPendingState(
        uint64 rollupID,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external ifNotEmergencyState {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        _proveDistinctPendingState(
            rollup,
            initPendingStateNum,
            finalPendingStateNum,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        emit ProveNonDeterministicPendingState(
            rollup.batchNumToStateRoot[finalNewBatch],
            newStateRoot
        );

        // Activate emergency state
        _activateEmergencyState();
    }

    /**
     * @notice Internal function that proves a different state root given the same batches to verify
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proof fflonk proof
     */
    function _proveDistinctPendingState(
        RollupData storage rollup,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) internal view virtual {
        bytes32 oldStateRoot;

        // Use pending state if specified, otherwise use consolidated state
        if (initPendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            if (initPendingStateNum > rollup.lastPendingState) {
                revert PendingStateDoesNotExist();
            }

            // Check choosen pending state
            PendingState storage initPendingState = rollup
                .pendingStateTransitions[initPendingStateNum];

            // Get oldStateRoot from init pending state
            oldStateRoot = initPendingState.stateRoot;

            // Check initNumBatch matches the init pending state
            if (initNumBatch != initPendingState.lastVerifiedBatch) {
                revert InitNumBatchDoesNotMatchPendingState();
            }
        } else {
            // Use consolidated state
            oldStateRoot = rollup.batchNumToStateRoot[initNumBatch];
            if (oldStateRoot == bytes32(0)) {
                revert OldStateRootDoesNotExist();
            }

            // Check initNumBatch is inside the range, sanity check
            if (initNumBatch > rollup.lastVerifiedBatch) {
                revert InitNumBatchAboveLastVerifiedBatch();
            }
        }

        // Assert final pending state num is in correct range
        // - exist ( has been added)
        // - bigger than the initPendingstate
        // - not consolidated
        if (
            finalPendingStateNum > rollup.lastPendingState ||
            finalPendingStateNum <= initPendingStateNum ||
            finalPendingStateNum <= rollup.lastPendingStateConsolidated
        ) {
            revert FinalPendingStateNumInvalid();
        }

        // Check final num batch
        if (
            finalNewBatch !=
            rollup
                .pendingStateTransitions[finalPendingStateNum]
                .lastVerifiedBatch
        ) {
            revert FinalNumBatchDoesNotMatchPendingState();
        }

        // Get snark bytes
        bytes memory snarkHashBytes = _getInputSnarkBytes(
            rollup,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        if (!rollup.verifierAddress.verifyProof(proof, [inputSnark])) {
            revert InvalidProof();
        }

        if (
            rollup.pendingStateTransitions[finalPendingStateNum].stateRoot ==
            newStateRoot
        ) {
            revert StoredRootMustBeDifferentThanNewRoot();
        }
    }

    /**
     * @notice Function to activate emergency state, which also enables the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contracts
     * If not called by the owner must be provided a batcnNum that does not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period
     * @param sequencedBatchNum Sequenced batch number that has not been aggreagated in _HALT_AGGREGATION_TIMEOUT
     */
    function activateEmergencyState(uint64 sequencedBatchNum) external {
        if (msg.sender != governance) {
            // TODO
            revert NotSupportedCurrently();
            // // Only check conditions if is not called by the owner
            // uint64 currentLastVerifiedBatch = getLastVerifiedBatch();
            // // Check that the batch has not been verified
            // if (sequencedBatchNum <= currentLastVerifiedBatch) {
            //     revert BatchAlreadyVerified();
            // }
            // // Check that the batch has been sequenced and this was the end of a sequence
            // if (
            //     sequencedBatchNum > lastBatchSequenced ||
            //     sequencedBatches[sequencedBatchNum].sequencedTimestamp == 0
            // ) {
            //     revert BatchNotSequencedOrNotSequenceEnd();
            // }
            // // Check that has been passed _HALT_AGGREGATION_TIMEOUT since it was sequenced
            // if (
            //     sequencedBatches[sequencedBatchNum].sequencedTimestamp +
            //         _HALT_AGGREGATION_TIMEOUT >
            //     block.timestamp
            // ) {
            //     revert HaltTimeoutNotExpired();
            // }
        }
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function deactivateEmergencyState() external onlyGovernance {
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

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new pending state timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newTrustedAggregatorTimeout Trusted aggregator timeout
     */
    function setTrustedAggregatorTimeout(
        uint64 newTrustedAggregatorTimeout
    ) external onlyGovernance {
        if (newTrustedAggregatorTimeout > _HALT_AGGREGATION_TIMEOUT) {
            revert TrustedAggregatorTimeoutExceedHaltAggregationTimeout();
        }

        if (!isEmergencyState) {
            if (newTrustedAggregatorTimeout >= trustedAggregatorTimeout) {
                revert NewTrustedAggregatorTimeoutMustBeLower();
            }
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
    ) external onlyGovernance {
        if (newPendingStateTimeout > _HALT_AGGREGATION_TIMEOUT) {
            revert PendingStateTimeoutExceedHaltAggregationTimeout();
        }

        if (!isEmergencyState) {
            if (newPendingStateTimeout >= pendingStateTimeout) {
                revert NewPendingStateTimeoutMustBeLower();
            }
        }

        pendingStateTimeout = newPendingStateTimeout;
        emit SetPendingStateTimeout(newPendingStateTimeout);
    }

    /**
     * @notice Starts the Governance role transfer
     * This is a two step process, the pending Governance must accepted to finalize the process
     * @param newPendingGovernance Address of the new pending Governance
     */
    function transferGovernanceRole(
        address newPendingGovernance
    ) external onlyGovernance {
        pendingGovernance = newPendingGovernance;
        emit TransferGovernanceRole(newPendingGovernance);
    }

    /**
     * @notice Allow the current pending Governance to accept the Governance role
     */
    function acceptGovernanceRole() external {
        if (pendingGovernance != msg.sender) {
            revert OnlyPendingGovernance();
        }

        governance = pendingGovernance;
        emit AcceptGovernanceRole(pendingGovernance);
    }

    ////////////////////////
    // public/view functions
    ////////////////////////

    /**
     * @notice Get the last verified batch
     */
    function getLastVerifiedBatch(
        uint64 rollupID
    ) public view returns (uint64) {
        return _getLastVerifiedBatch(rollupIDToRollupData[rollupID]);
    }

    /**
     * @notice Get the last verified batch
     */
    function _getLastVerifiedBatch(
        RollupData storage rollup
    ) internal view returns (uint64) {
        if (rollup.lastPendingState > 0) {
            return
                rollup
                    .pendingStateTransitions[rollup.lastPendingState]
                    .lastVerifiedBatch;
        } else {
            return rollup.lastVerifiedBatch;
        }
    }

    /**
     * @notice Returns a boolean that indicates if the pendingStateNum is or not consolidable
     * Note that his function does not check if the pending state currently exists, or if it's consolidated already
     */
    function isPendingStateConsolidable(
        uint64 rollupID,
        uint64 pendingStateNum
    ) public view returns (bool) {
        return
            _isPendingStateConsolidable(
                rollupIDToRollupData[rollupID],
                pendingStateNum
            );
    }

    /**
     * @notice Returns a boolean that indicates if the pendingStateNum is or not consolidable
     * Note that his function does not check if the pending state currently exists, or if it's consolidated already
     */
    function _isPendingStateConsolidable(
        RollupData storage rollup,
        uint64 pendingStateNum
    ) internal view returns (bool) {
        return (rollup.pendingStateTransitions[pendingStateNum].timestamp +
            pendingStateTimeout <=
            block.timestamp);
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param oldStateRoot State root before batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function getInputSnarkBytes(
        uint64 rollupID,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 oldStateRoot,
        bytes32 newStateRoot
    ) public view returns (bytes memory) {
        return
            _getInputSnarkBytes(
                rollupIDToRollupData[rollupID],
                initNumBatch,
                finalNewBatch,
                newLocalExitRoot,
                oldStateRoot,
                newStateRoot
            );
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param oldStateRoot State root before batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function _getInputSnarkBytes(
        RollupData storage rollup,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 oldStateRoot,
        bytes32 newStateRoot
    ) internal view returns (bytes memory) {
        // sanity checks
        bytes32 oldAccInputHash = rollup
            .sequencedBatches[initNumBatch]
            .accInputHash;

        bytes32 newAccInputHash = rollup
            .sequencedBatches[finalNewBatch]
            .accInputHash;

        // sanity checks
        if (initNumBatch != 0 && oldAccInputHash == bytes32(0)) {
            revert OldAccInputHashDoesNotExist();
        }

        if (newAccInputHash == bytes32(0)) {
            revert NewAccInputHashDoesNotExist();
        }

        // Check that new state root is inside goldilocks field
        if (!checkStateRootInsidePrime(uint256(newStateRoot))) {
            revert NewStateRootNotInsidePrime();
        }

        return
            abi.encodePacked(
                msg.sender, // TODO=?¿
                oldStateRoot,
                oldAccInputHash,
                initNumBatch,
                rollup.chainID,
                verifierMap[address(rollup.verifierAddress)].forkID,
                newStateRoot,
                newAccInputHash,
                newLocalExitRoot,
                finalNewBatch
            );
    }

    function checkStateRootInsidePrime(
        uint256 newStateRoot
    ) public pure returns (bool) {
        if (
            ((newStateRoot & _MAX_UINT_64) < _GOLDILOCKS_PRIME_FIELD) &&
            (((newStateRoot >> 64) & _MAX_UINT_64) < _GOLDILOCKS_PRIME_FIELD) &&
            (((newStateRoot >> 128) & _MAX_UINT_64) <
                _GOLDILOCKS_PRIME_FIELD) &&
            ((newStateRoot >> 192) < _GOLDILOCKS_PRIME_FIELD)
        ) {
            return true;
        } else {
            return false;
        }
    }
}
