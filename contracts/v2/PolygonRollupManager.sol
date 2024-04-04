// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.24;

import "./interfaces/IPolygonRollupManager.sol";
import "./interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "../interfaces/IPolygonZkEVMBridge.sol";
import "./interfaces/IPolygonRollupBaseFeijoa.sol";
import "../interfaces/IVerifierRollup.sol";
import "../lib/EmergencyManager.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./lib/PolygonTransparentProxy.sol";
import "./lib/PolygonAccessControlUpgradeable.sol";
import "./lib/LegacyZKEVMStateVariables.sol";
import "./lib/PolygonConstantsBase.sol";

/**
 * Contract responsible for managing rollups and the verification of their sequences.
 * This contract will create and update rollups and store all the hashed sequenced data from them.
 * The logic for sequence sequences is moved to the `consensus` contracts, while the verification of all of
 * them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.
 */
contract PolygonRollupManager is
    PolygonAccessControlUpgradeable,
    EmergencyManager,
    LegacyZKEVMStateVariables,
    PolygonConstantsBase,
    IPolygonRollupManager
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which to store the rollup type data
     * @param consensusImplementation Consensus implementation ( contains the consensus logic for the transaparent proxy)
     * @param verifier verifier
     * @param forkID fork ID
     * @param rollupCompatibilityID Rollup compatibility ID, to check upgradability between rollup types
     * @param obsolete Indicates if the rollup type is obsolete
     * @param genesis Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them
     */
    struct RollupType {
        address consensusImplementation;
        IVerifierRollup verifier;
        uint64 forkID;
        uint8 rollupCompatibilityID;
        bool obsolete;
        bytes32 genesis;
    }

    /**
     * @notice Struct which will be stored for every sequenc
     * @param accInputHash Hash chain that contains all the information to process a sequence:
     *  keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
     * @param sequencedTimestamp Sequenced timestamp
     * @param accZkGasLimit Previous last sequence sequenced before the current one, this is used to properly calculate the fees
     */
    struct SequencedData {
        bytes32 accInputHash;
        uint64 sequencedTimestamp;
        uint64 currentBlobNum;
        uint128 accZkGasLimit;
    }

    /**
     * @notice Struct to store the pending states
     * Pending state will be an intermediary state, that after a timeout can be consolidated, which means that will be added
     * to the state root mapping, and the global exit root will be updated
     * This is a protection mechanism against soundness attacks, that will be turned off in the future
     * @param timestamp Timestamp where the pending state is added to the queue
     * @param lastVerifiedSequence Last verified sequence of this pending state
     * @param exitRoot Pending exit root
     * @param stateRoot Pending state root
     */
    struct PendingStateSequenceBased {
        uint64 timestamp;
        uint64 lastVerifiedSequence;
        bytes32 exitRoot;
        bytes32 stateRoot;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param batchNumToStateRoot State root mapping
     * @param sequencedBatches Queue of batches that defines the virtual state
     * @param pendingStateTransitions Pending state mapping
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param lastPendingState Last pending state
     * @param lastPendingStateConsolidated Last pending state consolidated
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupCompatibilityID Rollup ID used for compatibility checks when upgrading
     */
    struct RollupData {
        IPolygonRollupBaseFeijoa rollupContract;
        uint64 chainID;
        IVerifierRollup verifier;
        uint64 forkID;
        mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
        mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
        mapping(uint256 pendingStateNum => PendingState) pendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 lastPendingState;
        uint64 lastPendingStateConsolidated;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        uint8 rollupCompatibilityID;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param sequenceNumToStateRoot State root mapping
     * @param sequences Queue of sequences that defines the virtual state
     * @param pendingStateTransitions Pending state mapping
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastSequenceNum Last sequence sent by the consensus contract
     * @param lastVerifiedSequenceNum Last sequence verified
     * @param lastPendingState Last pending state
     * @param lastPendingStateConsolidated Last pending state consolidated
     * @param lastVerifiedSequenceBeforeUpgrade Last sequence verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupCompatibilityID Rollup ID used for compatibility checks when upgrading
     */
    struct RollupDataSequenceBased {
        IPolygonRollupBaseFeijoa rollupContract;
        uint64 chainID;
        IVerifierRollup verifier;
        uint64 forkID;
        mapping(uint64 sequenceNum => bytes32) sequenceNumToStateRoot;
        mapping(uint64 sequenceNum => SequencedData) sequences;
        mapping(uint256 pendingStateNum => PendingStateSequenceBased) pendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastSequenceNum;
        uint64 lastVerifiedSequenceNum;
        uint64 lastPendingState;
        uint64 lastPendingStateConsolidated;
        uint64 lastVerifiedSequenceBeforeUpgrade;
        uint64 rollupTypeID;
        uint8 rollupCompatibilityID;
    }

    /**
     * @param rollupID Rollup identifier
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initSequenceNum Sequence which the aggregator starts the verification
     * @param finalSequenceNum Last sequence aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the sequence is processed
     * @param newStateRoot New State root once the sequence is processed
     **/
    struct VerifySequenceData {
        uint32 rollupID;
        uint64 pendingStateNum;
        uint64 initSequenceNum;
        uint64 finalSequenceNum;
        bytes32 newLocalExitRoot;
        bytes32 newStateRoot;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // TODO

    // Max sequence multiplier per verification
    uint256 internal constant _MAX_SEQUENCE_MULTIPLIER = 12;

    // Max sequence fee value
    uint256 internal constant _MAX_ZKGAS_PRICE = 1 ether;

    // Min value sequence fee
    uint256 internal constant _MIN_ZKGAS_PRICE = 1 wei;

    // Goldilocks prime field
    uint256 internal constant _GOLDILOCKS_PRIME_FIELD = 0xFFFFFFFF00000001; // 2 ** 64 - 2 ** 32 + 1

    // Max uint64
    uint256 internal constant _MAX_UINT_64 = type(uint64).max; // 0xFFFFFFFFFFFFFFFF

    // Exit merkle tree levels
    uint256 internal constant _EXIT_TREE_DEPTH = 32;

    // Bytes that will be added to the snark input for every rollup aggregated
    // |   32 bytes   |    32 bytes        |    32 bytes      |   8 bytes       |   8 bytes  |   8 bytes  |  32 bytes      | 32 bytes          |    32 bytes         |  8 bytes          | 32 bytes        |
    // | oldStateRoot | oldBlobStateRoot   |  oldAccInputHash | initNumBlob     |   chainID  |   forkID   |  newStateRoot  | newBlobStateRoot  |   newAccInputHash   |  finalBlobNum     |newLocalExitRoot |
    uint256 internal constant _SNARK_BYTES_PER_ROLLUP_AGGREGATED =
        32 + 32 + 32 + 8 + 8 + 8 + 32 + 32 + 32 + 8 + 32;
    // Roles

    // Be able to add a new rollup type
    bytes32 internal constant _ADD_ROLLUP_TYPE_ROLE =
        keccak256("ADD_ROLLUP_TYPE_ROLE");

    // Be able to obsolete a rollup type, which means that new rollups cannot use this type
    bytes32 internal constant _OBSOLETE_ROLLUP_TYPE_ROLE =
        keccak256("OBSOLETE_ROLLUP_TYPE_ROLE");

    // Be able to create a new rollup using a rollup type
    bytes32 internal constant _CREATE_ROLLUP_ROLE =
        keccak256("CREATE_ROLLUP_ROLE");

    // Be able to create a new rollup which does not have to follow any rollup type.
    // Also sets the genesis block for that network
    bytes32 internal constant _ADD_EXISTING_ROLLUP_ROLE =
        keccak256("ADD_EXISTING_ROLLUP_ROLE");

    // Be able to update a rollup to a new rollup type that it's compatible
    bytes32 internal constant _UPDATE_ROLLUP_ROLE =
        keccak256("UPDATE_ROLLUP_ROLE");

    // Be able to that has priority to verify sequences and consolidates the state instantly
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE =
        keccak256("TRUSTED_AGGREGATOR_ROLE");

    // Be able to set the trusted aggregator address
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE_ADMIN =
        keccak256("TRUSTED_AGGREGATOR_ROLE_ADMIN");

    // Be able to tweak parameters
    bytes32 internal constant _TWEAK_PARAMETERS_ROLE =
        keccak256("TWEAK_PARAMETERS_ROLE");

    // Be able to set the current sequence fee
    bytes32 internal constant _SET_FEE_ROLE = keccak256("SET_FEE_ROLE");

    // Be able to stop the emergency state
    bytes32 internal constant _STOP_EMERGENCY_ROLE =
        keccak256("STOP_EMERGENCY_ROLE");

    // Be able to activate the emergency state without any further condition
    bytes32 internal constant _EMERGENCY_COUNCIL_ROLE =
        keccak256("EMERGENCY_COUNCIL_ROLE");

    // Be able to set the emergency council address
    bytes32 internal constant _EMERGENCY_COUNCIL_ADMIN =
        keccak256("EMERGENCY_COUNCIL_ADMIN");

    // Global Exit Root address
    IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // POL token address
    IERC20Upgradeable public immutable pol;

    // Number of rollup types added, every new type will be assigned sequencially a new ID
    uint32 public rollupTypeCount;

    // Rollup type mapping
    mapping(uint32 rollupTypeID => RollupType) public rollupTypeMap;

    // Number of rollups added, every new rollup will be assigned sequencially a new ID
    uint32 public rollupCount;

    // Deprecated variable
    /// @custom:oz-renamed-from rollupIDToRollupData
    mapping(uint32 rollupID => RollupData) internal _legacyRollupIDToRollupData;

    // Rollups address mapping
    mapping(address rollupAddress => uint32 rollupID) public rollupAddressToID;

    // Chain ID mapping for nullifying
    // note we will take care to avoid that current known chainIDs are not reused in our networks (example: 1)
    mapping(uint64 chainID => uint32 rollupID) public chainIDToRollupID;

    // Total sequenced batches across all rollups
    /// @custom:oz-renamed-from totalSequencedBatches
    uint64 internal _legacyTotalSequencedBatches;

    // Total verified batches across all rollups
    /// @custom:oz-renamed-from totalVerifiedBatches
    uint64 internal _legacyTotalVerifiedBatches;

    // Last timestamp when an aggregation happen
    uint64 public lastAggregationTimestamp;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    uint64 public trustedAggregatorTimeout;

    // Once a pending state exceeds this timeout it can be consolidated
    uint64 public pendingStateTimeout;

    // Time target of the verification of a sequence
    // Adaptively the sequenceFee will be updated to achieve this target
    /// @custom:oz-renamed-from verifyBatchTimeTarget
    uint64 public verifySequenceTimeTarget;

    // Sequence fee multiplier with 3 decimals that goes from 1000 - 1023
    /// @custom:oz-renamed-from multiplierBatchFee
    uint16 public multiplierZkGasPrice;

    // Current POL fee per sequence sequenced
    // note This variable is internal, since the view function getSequenceFee is likely to be upgraded
    // note deprecated variable
    uint256 internal _batchFee;

    // Timestamp when the last emergency state was deactivated
    uint64 public lastDeactivatedEmergencyStateTimestamp;

    // Aggregate rollup verifier, can verify a proof for multiple rollups
    IVerifierRollup public aggregateRollupVerifier; // TODO set multiple?¿

    // Rollups ID mapping
    mapping(uint32 rollupID => RollupDataSequenceBased)
        public rollupIDToRollupData;

    // Total sequenced zkGasLimit across all rollups
    uint128 public totalZkGasLimit;

    // Total verified zkGasLimit across all rollups
    uint128 public totalVerifiedZkGasLimit;

    // Current POL fee per zkGas sequenced
    // note This variable is internal, since the view function getSequenceFee is likely to be upgraded
    uint256 internal _zkGasPrice;

    /**
     * @dev Emitted when a new rollup type is added
     */
    event AddNewRollupType(
        uint32 indexed rollupTypeID,
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        uint8 rollupCompatibilityID,
        bytes32 genesis,
        string description
    );

    /**
     * @dev Emitted when a a rolup type is obsoleted
     */
    event ObsoleteRollupType(uint32 indexed rollupTypeID);

    /**
     * @dev Emitted when a new rollup is created based on a rollupType
     */
    event CreateNewRollup(
        uint32 indexed rollupID,
        uint32 rollupTypeID,
        address rollupAddress,
        uint64 chainID,
        address gasTokenAddress
    );

    /**
     * @dev Emitted when an existing rollup is added
     */
    event AddExistingRollup(
        uint32 indexed rollupID,
        uint64 forkID,
        address rollupAddress,
        uint64 chainID,
        uint8 rollupCompatibilityID,
        uint64 lastVerifiedSequenceBeforeUpgrade
    );

    // TODO assert same event
    /**
     * @dev Emitted when a rollup is udpated
     */
    event UpdateRollup(
        uint32 indexed rollupID,
        uint32 newRollupTypeID,
        uint64 lastVerifiedSequenceBeforeUpgrade
    );

    /**
     * @dev Emitted when a the sequence callback is called
     */
    event OnSequence(
        uint32 indexed rollupID,
        uint128 zkGasLimit,
        uint64 blobsSequenced
    );

    // TODO rename event?¿
    /**
     * @dev Emitted when an aggregator verifies sequences
     */
    event VerifySequences(
        uint32 indexed rollupID,
        uint64 sequenceNum,
        bytes32 stateRoot,
        bytes32 exitRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when the aggregator verifies sequences
     */
    event VerifySequencesMultiProof(address indexed aggregator);

    /**
     * @dev Emitted when the trusted aggregator verifies sequences
     */
    event VerifySequencesTrustedAggregator(
        uint32 indexed rollupID,
        uint64 numSequence,
        bytes32 stateRoot,
        bytes32 exitRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when the trusted aggregator verifies sequences
     */
    event VerifySequencesTrustedAggregatorMultiProof(
        address indexed aggregator
    ); // TODO check?¿

    /**
     * @dev Emitted when pending state is consolidated
     */
    event ConsolidatePendingState(
        uint32 indexed rollupID,
        uint64 numSequence,
        bytes32 stateRoot,
        bytes32 exitRoot,
        uint64 pendingStateNum
    );

    /**
     * @dev Emitted when is proved a different state given the same sequences
     */
    event ProveNonDeterministicPendingState(
        bytes32 storedStateRoot,
        bytes32 provedStateRoot
    );

    /**
     * @dev Emitted when the trusted aggregator overrides pending state
     */
    event OverridePendingState(
        uint32 indexed rollupID,
        uint64 numSequence,
        bytes32 stateRoot,
        bytes32 exitRoot,
        address aggregator
    );

    /**
     * @dev Emitted when is updated the trusted aggregator timeout
     */
    event SetTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout);

    /**
     * @dev Emitted when is updated the pending state timeout
     */
    event SetPendingStateTimeout(uint64 newPendingStateTimeout);

    /**
     * @dev Emitted when is updated the multiplier sequence fee
     */
    event SetMultiplierZkGasPrice(uint16 newMultiplierSequenceFee);

    /**
     * @dev Emitted when is updated the verify sequence timeout
     */
    event SetVerifySequenceTimeTarget(uint64 newVerifySequenceTimeTarget);

    /**
     * @dev Emitted when is updated the trusted aggregator address
     */
    event SetTrustedAggregator(address newTrustedAggregator);

    /**
     * @dev Emitted when is updated the sequence fee
     */
    event SetSequenceFee(uint256 newSequenceFee);

    /**
     * @dev Emitted when the aggregated rollup verifier is updated
     */
    event SetAggregateRollupVerifier(IVerifierRollup aggregateRollupVerifier);

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress
    ) {
        globalExitRootManager = _globalExitRootManager;
        pol = _pol;
        bridgeAddress = _bridgeAddress;

        // Disable initalizers on the implementation following the best practices
        _disableInitializers();
    }

    /*
     * Migrate rollups from RollupData to the new struct RollupDataSequenceBased
     */
    function initialize() external virtual reinitializer(3) {
        for (uint256 i = 1; i <= rollupCount; i++) {
            // Migrate each rollup
            RollupData storage _legacyRollupData = _legacyRollupIDToRollupData[
                uint32(i)
            ];

            RollupDataSequenceBased
                storage newRollupData = rollupIDToRollupData[uint32(i)];

            newRollupData.chainID = _legacyRollupData.chainID;
            newRollupData.verifier = _legacyRollupData.verifier;
            newRollupData.forkID = _legacyRollupData.forkID;
            newRollupData.lastLocalExitRoot = _legacyRollupData
                .lastLocalExitRoot;
            newRollupData.rollupTypeID = _legacyRollupData.rollupTypeID;
            newRollupData.rollupCompatibilityID = _legacyRollupData
                .rollupCompatibilityID;

            // Do not copy verified/sequenced batches since it will be udpated to sequence
            // Do not copy pending state since it was not used yet

            // Copy mappings

            // TODO all bathces Must be verified, check on the smart contract?¿
            uint64 lastVerifiedBatch = _legacyRollupData.lastVerifiedBatch;
            if (lastVerifiedBatch != _legacyRollupData.lastBatchSequenced) {
                revert();
            }

            // Copy last state root
            newRollupData.sequenceNumToStateRoot[0] = _legacyRollupData
                .batchNumToStateRoot[lastVerifiedBatch];

            // Copy last accumulatedInputHash
            newRollupData.sequences[0].accInputHash = _legacyRollupData
                .sequencedBatches[lastVerifiedBatch]
                .accInputHash;

            // Do not copy state transitions since it was not used
            _zkGasPrice = _legacyBatchFee / ZK_GAS_LIMIT_BATCH;
        }
    }

    ///////////////////////////////////////
    // Rollups management functions
    ///////////////////////////////////////

    /**
     * @notice Add a new rollup type
     * @param consensusImplementation Consensus implementation
     * @param verifier Verifier address
     * @param forkID ForkID of the verifier
     * @param genesis Genesis block of the rollup
     * @param description Description of the rollup type
     */
    function addNewRollupType(
        address consensusImplementation,
        IVerifierRollup verifier,
        uint64 forkID,
        uint8 rollupCompatibilityID,
        bytes32 genesis,
        string memory description
    ) external onlyRole(_ADD_ROLLUP_TYPE_ROLE) {
        uint32 rollupTypeID = ++rollupTypeCount;

        rollupTypeMap[rollupTypeID] = RollupType({
            consensusImplementation: consensusImplementation,
            verifier: verifier,
            forkID: forkID,
            rollupCompatibilityID: rollupCompatibilityID,
            obsolete: false,
            genesis: genesis
        });

        emit AddNewRollupType(
            rollupTypeID,
            consensusImplementation,
            address(verifier),
            forkID,
            rollupCompatibilityID,
            genesis,
            description
        );
    }

    /**
     * @notice Obsolete Rollup type
     * @param rollupTypeID Rollup type to obsolete
     */
    function obsoleteRollupType(
        uint32 rollupTypeID
    ) external onlyRole(_OBSOLETE_ROLLUP_TYPE_ROLE) {
        // Check that rollup type exists
        if (rollupTypeID == 0 || rollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check rollup type is not obsolete
        RollupType storage currentRollupType = rollupTypeMap[rollupTypeID];
        if (currentRollupType.obsolete == true) {
            revert RollupTypeObsolete();
        }

        currentRollupType.obsolete = true;

        emit ObsoleteRollupType(rollupTypeID);
    }

    /**
     * @notice Create a new rollup
     * @param rollupTypeID Rollup type to deploy
     * @param chainID ChainID of the rollup, must be a new one, can not have more than 32 bits
     * @param admin Admin of the new created rollup
     * @param sequencer Sequencer of the new created rollup
     * @param gasTokenAddress Indicates the token address that will be used to pay gas fees in the new rollup
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped will be used instead
     * @param sequencerURL Sequencer URL of the new created rollup
     * @param networkName Network name of the new created rollup
     */
    function createNewRollup(
        uint32 rollupTypeID,
        uint64 chainID,
        address admin,
        address sequencer,
        address gasTokenAddress,
        string memory sequencerURL,
        string memory networkName
    ) external onlyRole(_CREATE_ROLLUP_ROLE) {
        // Check that rollup type exists
        if (rollupTypeID == 0 || rollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check rollup type is not obsolete
        RollupType storage rollupType = rollupTypeMap[rollupTypeID];
        if (rollupType.obsolete == true) {
            revert RollupTypeObsolete();
        }

        // check chainID max value
        // Currently we have this limitation by the circuit, might be removed in a future
        if (chainID > type(uint32).max) {
            revert ChainIDOutOfRange();
        }

        // Check chainID nullifier
        if (chainIDToRollupID[chainID] != 0) {
            revert ChainIDAlreadyExist();
        }

        // Create a new Rollup, using a transparent proxy pattern
        // Consensus will be the implementation, and this contract the admin
        uint32 rollupID = ++rollupCount;
        address rollupAddress = address(
            new PolygonTransparentProxy(
                rollupType.consensusImplementation,
                address(this),
                new bytes(0)
            )
        );

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        // Store rollup data
        rollupAddressToID[rollupAddress] = rollupID;

        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];

        rollup.rollupContract = IPolygonRollupBaseFeijoa(rollupAddress);
        rollup.forkID = rollupType.forkID;
        rollup.verifier = rollupType.verifier;
        rollup.chainID = chainID;
        rollup.sequenceNumToStateRoot[0] = rollupType.genesis;
        rollup.rollupTypeID = rollupTypeID;
        rollup.rollupCompatibilityID = rollupType.rollupCompatibilityID;

        emit CreateNewRollup(
            rollupID,
            rollupTypeID,
            rollupAddress,
            chainID,
            gasTokenAddress
        );

        // Initialize new rollup
        IPolygonRollupBaseFeijoa(rollupAddress).initialize(
            admin,
            sequencer,
            rollupID,
            gasTokenAddress,
            sequencerURL,
            networkName
        );
    }

    /**
     * @notice Add an already deployed rollup
     * note that this rollup does not follow any rollupType
     * @param rollupAddress Rollup address
     * @param verifier Verifier address, must be added before
     * @param forkID Fork id of the added rollup
     * @param chainID Chain id of the added rollup
     * @param genesis Genesis block for this rollup
     * @param rollupCompatibilityID Compatibility ID for the added rollup
     */
    function addExistingRollup(
        IPolygonRollupBaseFeijoa rollupAddress,
        IVerifierRollup verifier,
        uint64 forkID,
        uint64 chainID,
        bytes32 genesis,
        uint8 rollupCompatibilityID
    ) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE) {
        // Check chainID nullifier
        if (chainIDToRollupID[chainID] != 0) {
            revert ChainIDAlreadyExist();
        }

        // Check if rollup address was already added
        if (rollupAddressToID[address(rollupAddress)] != 0) {
            revert RollupAddressAlreadyExist();
        }

        RollupDataSequenceBased storage rollup = _addExistingRollup(
            rollupAddress,
            verifier,
            forkID,
            chainID,
            rollupCompatibilityID
        );
        rollup.sequenceNumToStateRoot[0] = genesis;
    }

    /**
     * @notice Add an already deployed rollup
     * note that this rollup does not follow any rollupType
     * @param rollupAddress Rollup address
     * @param verifier Verifier address, must be added before
     * @param forkID Fork id of the added rollup
     * @param chainID Chain id of the added rollup
     * @param rollupCompatibilityID Compatibility ID for the added rollup
     */
    function _addExistingRollup(
        IPolygonRollupBaseFeijoa rollupAddress,
        IVerifierRollup verifier,
        uint64 forkID,
        uint64 chainID,
        uint8 rollupCompatibilityID
    ) internal returns (RollupDataSequenceBased storage rollup) {
        uint32 rollupID = ++rollupCount;

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        // Store rollup data
        rollupAddressToID[address(rollupAddress)] = rollupID;

        rollup = rollupIDToRollupData[rollupID];
        rollup.rollupContract = rollupAddress;
        rollup.forkID = forkID;
        rollup.verifier = verifier;
        rollup.chainID = chainID;
        rollup.rollupCompatibilityID = rollupCompatibilityID;
        // rollup type is 0, since it does not follow any rollup type

        emit AddExistingRollup(
            rollupID,
            forkID,
            address(rollupAddress),
            chainID,
            rollupCompatibilityID,
            0
        );
    }

    function updateRollupByRollupAdmin(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID
    ) external {
        // Check admin of the network is msg.sender
        if (
            IPolygonRollupBaseFeijoa(address(rollupContract)).admin() !=
            msg.sender
        ) {
            revert OnlyRollupAdmin();
        }

        // Check all sequences are verified before upgrading
        RollupDataSequenceBased storage rollup = rollupIDToRollupData[
            rollupAddressToID[address(rollupContract)]
        ];
        // If rollupID does not exist (rollupID = 0), will revert afterwards

        if (rollup.lastSequenceNum != rollup.lastVerifiedSequenceNum) {
            revert AllSequencedMustBeVerified();
        }

        // TODO Assert new rollupType is bigger?¿ or with obsolete it's enough?¿
        if (rollup.rollupTypeID >= newRollupTypeID) {
            revert UpdateToSameRollupTypeID(); // Update custom error
        }

        _updateRollup(rollupContract, newRollupTypeID, new bytes(0));
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rolluptypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        _updateRollup(rollupContract, newRollupTypeID, upgradeData);
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rolluptypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function _updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) internal {
        // Check that rollup type exists
        if (newRollupTypeID == 0 || newRollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check the rollup exists
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        if (rollupID == 0) {
            revert RollupMustExist();
        }

        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];

        // The update must be to a new rollup type
        if (rollup.rollupTypeID == newRollupTypeID) {
            revert UpdateToSameRollupTypeID();
        }

        RollupType storage newRollupType = rollupTypeMap[newRollupTypeID];

        // Check rollup type is not obsolete
        if (newRollupType.obsolete == true) {
            revert RollupTypeObsolete();
        }

        // Check compatibility of the rollups
        if (
            rollup.rollupCompatibilityID != newRollupType.rollupCompatibilityID
        ) {
            revert UpdateNotCompatible();
        }

        // Update rollup parameters
        rollup.verifier = newRollupType.verifier;
        rollup.forkID = newRollupType.forkID;
        rollup.rollupTypeID = newRollupTypeID;

        // TODO Vulnerability fron running attack TT actually hard to handle
        if (rollup.lastPendingState != rollup.lastPendingStateConsolidated) {
            revert CannotUpdateWithUnconsolidatedPendingState();
        }

        uint64 lastVerifiedSequence = getLastVerifiedSequence(rollupID);
        rollup.lastVerifiedSequenceBeforeUpgrade = lastVerifiedSequence;

        // Upgrade rollup
        rollupContract.upgradeToAndCall(
            newRollupType.consensusImplementation,
            upgradeData
        );

        emit UpdateRollup(rollupID, newRollupTypeID, lastVerifiedSequence);
    }

    /////////////////////////////////////
    // Sequence/Verify sequence functions
    ////////////////////////////////////

    /**
     * @notice callback called by one of the consensus managed by this contract once data is sequenced
     * @param zkGasLimitSequenced computational power needed for create a proof
     * @param blobsSequenced Number of blobs sequenced
     * @param newAccInputHash New accumulate input hash
     */
    function onSequence(
        uint128 zkGasLimitSequenced,
        uint64 blobsSequenced,
        bytes32 newAccInputHash
    ) external ifNotEmergencyState returns (uint64) {
        // Check that the msg.sender is an added rollup
        uint32 rollupID = rollupAddressToID[msg.sender];
        if (rollupID == 0) {
            revert SenderMustBeRollup();
        }

        // TODO put a minimum zkGasLimit per sequence?¿
        if (blobsSequenced == 0) {
            revert MustSequenceSomeBlob();
        }

        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];

        // Update global parameters
        totalZkGasLimit += zkGasLimitSequenced;

        // Update paramaters of the current rollup
        uint64 currentSequenceNum = rollup.lastSequenceNum;
        uint64 newSequenceNum = currentSequenceNum + 1;
        uint128 newAccZkGasLimit = rollup
            .sequences[currentSequenceNum]
            .accZkGasLimit + zkGasLimitSequenced;

        uint64 newBlobNum = uint64(
            rollup.sequences[currentSequenceNum].currentBlobNum
        ) + uint64(blobsSequenced);

        rollup.lastSequenceNum = newSequenceNum;
        rollup.sequences[newSequenceNum] = SequencedData({
            accInputHash: newAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            currentBlobNum: newBlobNum,
            accZkGasLimit: newAccZkGasLimit
        });

        // Consolidate pending state if possible
        _tryConsolidatePendingState(rollup);

        emit OnSequence(rollupID, zkGasLimitSequenced, blobsSequenced);

        return newSequenceNum;
    }

    /**
     * @notice Allows an aggregator to verify multiple sequences of multiple rollups
     * @param verifySequencesData Struct that contains all the necessary data to verify sequences
     * @param beneficiary Address that will receive the verification reward
     * @param proof Fflonk proof
     */
    function verifySequencesMultiProof(
        VerifySequenceData[] calldata verifySequencesData,
        address beneficiary,
        bytes32[24] calldata proof
    ) external ifNotEmergencyState {
        // aggregateInput and verify the zkproof
        _aggregateInputAndVerifyProof(verifySequencesData, beneficiary, proof);

        // Consolidate state of every rollup
        for (uint256 i = 0; i < verifySequencesData.length; i++) {
            VerifySequenceData
                memory currentVerifySequenceData = verifySequencesData[i];

            RollupDataSequenceBased
                storage currentRollup = rollupIDToRollupData[
                    currentVerifySequenceData.rollupID
                ];

            // Check if the trusted aggregator timeout expired,
            // Note that the sequence struct must exists for this finalSequenceNum, if not newAccInputHash will be 0
            if (
                currentRollup
                    .sequences[currentVerifySequenceData.finalSequenceNum]
                    .sequencedTimestamp +
                    trustedAggregatorTimeout >
                block.timestamp
            ) {
                revert TrustedAggregatorTimeoutNotExpired();
            }

            // Update zkGas fees
            _updateZkGasFee(
                currentRollup,
                currentVerifySequenceData.finalSequenceNum
            );

            if (pendingStateTimeout == 0) {
                // Set last verify sequence
                currentRollup.lastSequenceNum = currentVerifySequenceData
                    .finalSequenceNum;

                // Set new state root
                currentRollup.sequenceNumToStateRoot[
                    currentVerifySequenceData.finalSequenceNum
                ] = currentVerifySequenceData.newStateRoot;

                // Set new local exit root
                currentRollup.lastLocalExitRoot = currentVerifySequenceData
                    .newLocalExitRoot;

                // Clean pending state if any
                if (currentRollup.lastPendingState > 0) {
                    currentRollup.lastPendingState = 0;
                    currentRollup.lastPendingStateConsolidated = 0;
                }
            } else {
                // Consolidate pending state if possible
                _tryConsolidatePendingState(currentRollup);

                // Update pending state
                currentRollup.lastPendingState++;
                currentRollup.pendingStateTransitions[
                    currentRollup.lastPendingState
                ] = PendingStateSequenceBased({
                    timestamp: uint64(block.timestamp),
                    lastVerifiedSequence: currentVerifySequenceData
                        .finalSequenceNum,
                    exitRoot: currentVerifySequenceData.newLocalExitRoot,
                    stateRoot: currentVerifySequenceData.newStateRoot
                });
            }

            // Emit events
            rollupIDToRollupData[currentVerifySequenceData.rollupID]
                .rollupContract
                .onVerifySequences(
                    currentVerifySequenceData.finalSequenceNum,
                    currentVerifySequenceData.newStateRoot,
                    msg.sender
                );

            // emit an event for every rollupID? // review
            // emit a global event? ( then the sychronizer must synch all this events and )
            emit VerifySequences(
                currentVerifySequenceData.rollupID,
                currentVerifySequenceData.finalSequenceNum,
                currentVerifySequenceData.newStateRoot,
                currentVerifySequenceData.newLocalExitRoot,
                msg.sender
            );
        }
        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        //emit VerifySequencesMultiProof(msg.sender);
    }

    /**
     * @notice Allows an aggregator to verify multiple sequences of multiple rollups
     * @param verifySequencesData Struct that contains all the necessary data to verify sequences
     * @param beneficiary Address that will receive the verification reward
     * @param proof Fflonk proof
     */
    function verifySequencesTrustedAggregatorMultiProof(
        VerifySequenceData[] calldata verifySequencesData,
        address beneficiary,
        bytes32[24] calldata proof
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) {
        // review, check if it's 0 the length?¿, it will fail since the proof will be a hash of the msg.sender
        // aggregateInput and verify the zkproof
        _aggregateInputAndVerifyProof(verifySequencesData, beneficiary, proof);

        // Consolidate state of every rollup
        for (uint256 i = 0; i < verifySequencesData.length; i++) {
            VerifySequenceData
                memory currentVerifySequenceData = verifySequencesData[i];

            RollupDataSequenceBased
                storage currentRollup = rollupIDToRollupData[
                    currentVerifySequenceData.rollupID
                ];

            // Set last verify sequence
            currentRollup.lastVerifiedSequenceNum = currentVerifySequenceData
                .finalSequenceNum;

            // Set new state root
            currentRollup.sequenceNumToStateRoot[
                currentVerifySequenceData.finalSequenceNum
            ] = currentVerifySequenceData.newStateRoot;

            // Set new local exit root
            currentRollup.lastLocalExitRoot = currentVerifySequenceData
                .newLocalExitRoot;

            // Clean pending state if any
            if (currentRollup.lastPendingState > 0) {
                currentRollup.lastPendingState = 0;
                currentRollup.lastPendingStateConsolidated = 0;
            }

            rollupIDToRollupData[currentVerifySequenceData.rollupID]
                .rollupContract
                .onVerifySequences(
                    currentVerifySequenceData.finalSequenceNum,
                    currentVerifySequenceData.newStateRoot,
                    msg.sender
                );

            // emit an event for every rollupID? // review
            // emit a global event? ( then the sychronizer must synch all this events and )
            emit VerifySequencesTrustedAggregator(
                currentVerifySequenceData.rollupID,
                currentVerifySequenceData.finalSequenceNum,
                currentVerifySequenceData.newStateRoot,
                currentVerifySequenceData.newLocalExitRoot,
                msg.sender
            );
        }

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        // review not global event
        //emit VerifySequencesTrustedAggregatorMultiProof(msg.sender);
    }

    /**
     * @notice Intenral function with the common logic to aggregate the snark input and verify proofs
     * @param verifySequencesData Struct that contains all the necessary data to verify sequences
     * @param beneficiary Address that will receive the verification reward
     * @param proof Fflonk proof
     */
    function _aggregateInputAndVerifyProof(
        VerifySequenceData[] calldata verifySequencesData,
        address beneficiary,
        bytes32[24] calldata proof
    ) internal {
        // Create a snark input byte array
        bytes memory accumulateSnarkBytes;

        // This pointer will be the current position to write on accumulateSnarkBytes
        uint256 ptrAccumulateInputSnarkBytes;

        // Total length of the accumulateSnarkBytes, ByesPerRollup * rollupToVerify + 20 bytes (msg.sender)
        uint256 totalSnarkLength = _SNARK_BYTES_PER_ROLLUP_AGGREGATED *
            verifySequencesData.length +
            20;

        // Use assembly to rever memory and get the memory pointer
        assembly {
            // Set accumulateSnarkBytes to the next free memory space
            accumulateSnarkBytes := mload(0x40)

            // Reserve the memory: 32 bytes for the byte array length + 32 bytes extra for byte manipulation (0x40) +
            // the length of the input snark bytes
            mstore(0x40, add(add(accumulateSnarkBytes, 0x40), totalSnarkLength))

            // Set the length of the input bytes
            mstore(accumulateSnarkBytes, totalSnarkLength)

            // Set the pointer on the start of the actual byte array
            ptrAccumulateInputSnarkBytes := add(accumulateSnarkBytes, 0x20)
        }

        uint32 lastRollupID;
        uint128 totalVerifiedZkGas;

        // Loop through all rollups
        for (uint256 i = 0; i < verifySequencesData.length; i++) {
            uint32 currentRollupID = verifySequencesData[i].rollupID;
            // Check that same rollup can't be used twice in this call
            // Security considerations: RollupExitRoot could not be the final D:, little bit inconsisten events
            if (currentRollupID <= lastRollupID) {
                revert RollupIDNotAscendingOrder();
            }
            // Update lastRollupID,
            lastRollupID = currentRollupID;

            // Append the current rollup verification data to the accumulateSnarkBytes
            uint128 verifiedZkGas;
            (
                verifiedZkGas,
                ptrAccumulateInputSnarkBytes
            ) = _checkAndAccumulateverifySequencesData(
                verifySequencesData[i],
                ptrAccumulateInputSnarkBytes
            );
            totalVerifiedZkGas += verifiedZkGas;
        }

        // Append msg.sender to the input snark bytes
        _appendSenderToInputSnarkBytes(ptrAccumulateInputSnarkBytes);

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(accumulateSnarkBytes)) % _RFIELD;

        // Select verifier
        IVerifierRollup verifier;
        if (verifySequencesData.length == 1) {
            // Get the verifier rollup specific
            verifier = rollupIDToRollupData[verifySequencesData[0].rollupID]
                .verifier;
        } else {
            // Get the aggregated verifier
            verifier = aggregateRollupVerifier;
        }

        if (!verifier.verifyProof(proof, [inputSnark])) {
            revert InvalidProof();
        }

        // Pay POL rewards
        pol.safeTransfer(
            beneficiary,
            calculateRewardPerZkGas() * totalVerifiedZkGas
        );

        // Update global aggregation parameters
        totalVerifiedZkGas += totalVerifiedZkGas;
        lastAggregationTimestamp = uint64(block.timestamp);
    }

    /**
     * @notice Verify and reward sequences internal function
     * @param currentSequenceData Struct that contains all the necessary data to verify sequences
     * @param ptrAccumulateInputSnarkBytes Memory pointer to the bytes array that will accumulate all rollups data to finally be used as the snark input
     */
    function _checkAndAccumulateverifySequencesData(
        VerifySequenceData memory currentSequenceData,
        uint256 ptrAccumulateInputSnarkBytes
    ) internal view virtual returns (uint128, uint256) {
        RollupDataSequenceBased storage rollup = rollupIDToRollupData[
            currentSequenceData.rollupID
        ];

        bytes32 oldStateRoot = _checkAndRetrieveOldStateRoot(
            rollup,
            currentSequenceData.pendingStateNum,
            currentSequenceData.initSequenceNum
        );

        uint64 currentLastVerifiedSequence = _getLastVerifiedSequence(rollup);

        // Check final sequence
        if (
            currentSequenceData.finalSequenceNum <= currentLastVerifiedSequence
        ) {
            revert FinalNumSequenceBelowLastVerifiedSequence();
        }

        // Get snark bytes
        // review use struct instead?¿
        uint256 currentPtr = _appendDataToInputSnarkBytes(
            rollup,
            currentSequenceData.initSequenceNum,
            currentSequenceData.finalSequenceNum,
            currentSequenceData.newLocalExitRoot,
            oldStateRoot,
            currentSequenceData.newStateRoot,
            ptrAccumulateInputSnarkBytes
        );

        // Return verified sequences
        return (
            rollup
                .sequences[currentSequenceData.finalSequenceNum]
                .accZkGasLimit -
                rollup.sequences[currentLastVerifiedSequence].accZkGasLimit,
            currentPtr
        );
    }

    /**
     * @notice Internal function with common logic to retrieve the old state root from a rollup, a pending state num and initSequenceNum
     * @param rollup Rollup data storage pointer
     * @param pendingStateNum Init pending state, 0 if consolidated state is used
     * @param initSequenceNum Sequence which the aggregator starts the verification
     */
    function _checkAndRetrieveOldStateRoot(
        RollupDataSequenceBased storage rollup,
        uint64 pendingStateNum,
        uint64 initSequenceNum
    ) internal view returns (bytes32) {
        if (initSequenceNum < rollup.lastVerifiedSequenceBeforeUpgrade) {
            revert InitSequenceMustMatchCurrentForkID();
        }

        bytes32 oldStateRoot;

        // Use pending state if specified, otherwise use consolidated state
        if (pendingStateNum != 0) {
            // Check that pending state exist
            // Already consolidated pending states can be used aswell
            if (pendingStateNum > rollup.lastPendingState) {
                revert PendingStateDoesNotExist();
            }

            // Check choosen pending state
            PendingStateSequenceBased storage currentPendingState = rollup
                .pendingStateTransitions[pendingStateNum];

            // Get oldStateRoot from pending sequence
            oldStateRoot = currentPendingState.stateRoot;

            // Check initSequenceNum matches the pending state
            if (initSequenceNum != currentPendingState.lastVerifiedSequence) {
                revert InitSequenceNumDoesNotMatchPendingState();
            }
        } else {
            // Use consolidated state
            oldStateRoot = rollup.sequenceNumToStateRoot[initSequenceNum];

            if (oldStateRoot == bytes32(0)) {
                revert OldStateRootDoesNotExist();
            }
        }

        return oldStateRoot;
    }

    /**
     * @notice Internal function to consolidate the state automatically once sequence or verify sequences are called
     * It tries to consolidate the first and the middle pending state in the queue
     */
    function _tryConsolidatePendingState(
        RollupDataSequenceBased storage rollup
    ) internal {
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
     * @param rollupID Rollup identifier
     * @param pendingStateNum Pending state to consolidate
     */
    function consolidatePendingState(
        uint32 rollupID,
        uint64 pendingStateNum
    ) external {
        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];
        // Check if pending state can be consolidated
        // If trusted aggregator is the sender, do not check the timeout or the emergency state
        if (!hasRole(_TRUSTED_AGGREGATOR_ROLE, msg.sender)) {
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
     * @param rollup Rollup data storage pointer
     * @param pendingStateNum Pending state to consolidate
     */
    function _consolidatePendingState(
        RollupDataSequenceBased storage rollup,
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

        PendingStateSequenceBased storage currentPendingState = rollup
            .pendingStateTransitions[pendingStateNum];

        // Update state
        uint64 newLastVerifiedSequence = currentPendingState
            .lastVerifiedSequence;
        rollup.lastVerifiedSequenceNum = newLastVerifiedSequence;
        rollup.sequenceNumToStateRoot[
            newLastVerifiedSequence
        ] = currentPendingState.stateRoot;
        rollup.lastLocalExitRoot = currentPendingState.exitRoot;

        // Update pending state
        rollup.lastPendingStateConsolidated = pendingStateNum;

        // Interact with globalExitRootManager  // TODO review, update global after event?¿
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        emit ConsolidatePendingState(
            rollupAddressToID[address(rollup.rollupContract)],
            newLastVerifiedSequence,
            currentPendingState.stateRoot,
            currentPendingState.exitRoot,
            pendingStateNum
        );
    }

    /////////////////////////////////
    // Soundness protection functions
    /////////////////////////////////

    /**
     * @notice Allows the trusted aggregator to override the pending state
     * if it's possible to prove a different state root given the same sequences
     * @param rollupID Rollup identifier
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initSequenceNum Sequence which the aggregator starts the verification
     * @param finalSequenceNum Last sequence aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the sequence is processed
     * @param newStateRoot New State root once the sequence is processed
     * @param proof Fflonk proof
     */
    function overridePendingState(
        uint32 rollupID,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initSequenceNum,
        uint64 finalSequenceNum,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) {
        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];

        _proveDistinctPendingState(
            rollup,
            initPendingStateNum,
            finalPendingStateNum,
            initSequenceNum,
            finalSequenceNum,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        // Consolidate state
        rollup.lastVerifiedSequenceNum = finalSequenceNum;
        rollup.sequenceNumToStateRoot[finalSequenceNum] = newStateRoot;
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

        emit OverridePendingState(
            rollupID,
            finalSequenceNum,
            newStateRoot,
            newLocalExitRoot,
            msg.sender
        );
    }

    /**
     * @notice Allows activate the emergency state if its possible to prove a different state root given the same sequences
     * @param rollupID Rollup identifier
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initSequenceNum Sequence which the aggregator starts the verification
     * @param finalSequenceNum Last sequence aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the sequence is processed
     * @param newStateRoot New State root once the sequence is processed
     * @param proof Fflonk proof
     */
    function proveNonDeterministicPendingState(
        uint32 rollupID,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initSequenceNum,
        uint64 finalSequenceNum,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) external ifNotEmergencyState {
        RollupDataSequenceBased storage rollup = rollupIDToRollupData[rollupID];

        _proveDistinctPendingState(
            rollup,
            initPendingStateNum,
            finalPendingStateNum,
            initSequenceNum,
            finalSequenceNum,
            newLocalExitRoot,
            newStateRoot,
            proof
        );

        emit ProveNonDeterministicPendingState(
            rollup.pendingStateTransitions[finalPendingStateNum].stateRoot,
            newStateRoot
        );

        // Activate emergency state
        _activateEmergencyState();
    }

    /**
     * @notice Internal function that proves a different state root given the same sequences to verify
     * @param rollup Rollup Data struct that will be checked
     * @param initPendingStateNum Init pending state, 0 if consolidated state is used
     * @param finalPendingStateNum Final pending state, that will be used to compare with the newStateRoot
     * @param initSequenceNum Sequence which the aggregator starts the verification
     * @param finalSequenceNum Last sequence aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the sequence is processed
     * @param newStateRoot New State root once the sequence is processed
     * @param proof Fflonk proof
     */
    function _proveDistinctPendingState(
        RollupDataSequenceBased storage rollup,
        uint64 initPendingStateNum,
        uint64 finalPendingStateNum,
        uint64 initSequenceNum,
        uint64 finalSequenceNum,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        bytes32[24] calldata proof
    ) internal view virtual {
        bytes32 oldStateRoot = _checkAndRetrieveOldStateRoot(
            rollup,
            initPendingStateNum,
            initSequenceNum
        );

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

        // Check final num sequence
        if (
            finalSequenceNum !=
            rollup
                .pendingStateTransitions[finalPendingStateNum]
                .lastVerifiedSequence
        ) {
            revert FinalNumSequenceDoesNotMatchPendingState();
        }

        // Create a snark input byte array
        bytes memory accumulateSnarkBytes;

        // This pointer will be the current position to write on accumulateSnarkBytes
        uint256 ptrAccumulateInputSnarkBytes;

        // Total length of the accumulateSnarkBytes, ByesPerRollup + 20 bytes (msg.sender)
        uint256 totalSnarkLength = _SNARK_BYTES_PER_ROLLUP_AGGREGATED + 20;

        // Use assembly to rever memory and get the memory pointer
        assembly {
            // Set accumulateSnarkBytes to the next free memory space
            accumulateSnarkBytes := mload(0x40)

            // Reserve the memory: 32 bytes for the byte array length + 32 bytes extra for byte manipulation (0x40) +
            // the length of the input snark bytes
            mstore(0x40, add(add(accumulateSnarkBytes, 0x40), totalSnarkLength))

            // Set the length of the input bytes
            mstore(accumulateSnarkBytes, totalSnarkLength)

            // Set the pointer on the start of the actual byte array
            ptrAccumulateInputSnarkBytes := add(accumulateSnarkBytes, 0x20)
        }

        // Get snark bytes
        ptrAccumulateInputSnarkBytes = _appendDataToInputSnarkBytes(
            rollup,
            initSequenceNum,
            finalSequenceNum,
            newLocalExitRoot,
            oldStateRoot,
            newStateRoot,
            ptrAccumulateInputSnarkBytes
        );

        // Append sender to the snark bytes
        _appendSenderToInputSnarkBytes(ptrAccumulateInputSnarkBytes);

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(accumulateSnarkBytes)) % _RFIELD;

        // Verify proof
        if (!rollup.verifier.verifyProof(proof, [inputSnark])) {
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
     * @notice Function to update the zkgas fee based on the new verified sequences
     * The sequence fee will not be updated when the trusted aggregator verifies sequences
     * @param rollup Rollup storage pointer
     * @param newLastVerifiedSequence New last verified sequence
     */
    function _updateZkGasFee(
        RollupDataSequenceBased storage rollup,
        uint64 newLastVerifiedSequence
    ) internal {
        uint64 currentLastVerifiedSequence = _getLastVerifiedSequence(rollup);
        uint64 currentSequence = newLastVerifiedSequence;

        uint256 totalZkGasAboveTarget;
        uint256 newZkGasVerified = rollup
            .sequences[newLastVerifiedSequence]
            .accZkGasLimit -
            rollup.sequences[currentLastVerifiedSequence].accZkGasLimit;

        uint256 targetTimestamp = block.timestamp - verifySequenceTimeTarget;

        while (currentSequence != currentLastVerifiedSequence) {
            // Load sequenced sequencedata
            SequencedData storage currentSequencedData = rollup.sequences[
                currentSequence
            ];

            // Check if timestamp is below the verifySequenceTimeTarget
            if (targetTimestamp < currentSequencedData.sequencedTimestamp) {
                // update currentSequence
                currentSequence = currentSequence - 1;
            } else {
                // The rest of zkGas will be above
                totalZkGasAboveTarget =
                    newZkGasVerified -
                    currentSequencedData.accZkGasLimit;
                break;
            }
        }

        uint256 totalZkGasBelowTarget = newZkGasVerified -
            totalZkGasAboveTarget;

        // _MAX_ZKGAS_PRICE --> (< 70 bits)
        // multiplierSequenceFee --> (< 10 bits)
        // _MAX_Sequence_MULTIPLIER = 12
        // multiplierSequenceFee ** _MAX_Sequence_MULTIPLIER --> (< 128 bits)
        // sequenceFee * (multiplierSequenceFee ** _MAX_Sequence_MULTIPLIER)-->
        // (< 70 bits) * (< 128 bits) = < 256 bits

        // Since all the following operations cannot overflow, we can optimize this operations with unchecked
        unchecked {
            if (totalZkGasAboveTarget < totalZkGasBelowTarget) {
                // There are more sequences above target, fee is multiplied
                uint256 diffZkGasNormalized = (totalZkGasBelowTarget -
                    totalZkGasAboveTarget) / ZK_GAS_LIMIT_BATCH;

                diffZkGasNormalized = diffZkGasNormalized >
                    _MAX_SEQUENCE_MULTIPLIER
                    ? _MAX_SEQUENCE_MULTIPLIER
                    : diffZkGasNormalized;

                // For every multiplierSequenceFee multiplication we must shift 3 zeroes since we have 3 decimals
                _zkGasPrice =
                    (_zkGasPrice *
                        (uint256(multiplierZkGasPrice) **
                            diffZkGasNormalized)) /
                    (uint256(1000) ** diffZkGasNormalized);
            } else {
                // There are more sequences below target, fee is divided
                uint256 diffZkGasNormalized = (totalZkGasAboveTarget -
                    totalZkGasBelowTarget) / ZK_GAS_LIMIT_BATCH;

                diffZkGasNormalized = diffZkGasNormalized >
                    _MAX_SEQUENCE_MULTIPLIER
                    ? _MAX_SEQUENCE_MULTIPLIER
                    : diffZkGasNormalized;

                // For every multiplierZkGasPrice multiplication we must shift 3 zeroes since we have 3 decimals
                uint256 accDivisor = (uint256(1 ether) *
                    (uint256(multiplierZkGasPrice) ** diffZkGasNormalized)) /
                    (uint256(1000) ** diffZkGasNormalized);

                // multiplyFactor = multiplierSequenceFee ** diffZkGasNormalized / 10 ** (diffZkGasNormalized * 3)
                // accDivisor = 1E18 * multiplyFactor
                // 1E18 * sequenceFee / accDivisor = sequenceFee / multiplyFactor
                // < 60 bits * < 70 bits / ~60 bits --> overflow not possible
                _zkGasPrice = (uint256(1 ether) * _zkGasPrice) / accDivisor;
            }
        }

        // Sequence fee must remain inside a range
        if (_zkGasPrice > _MAX_ZKGAS_PRICE) {
            _zkGasPrice = _MAX_ZKGAS_PRICE;
        } else if (_zkGasPrice < _MIN_ZKGAS_PRICE) {
            _zkGasPrice = _MIN_ZKGAS_PRICE;
        }
    }

    ////////////////////////
    // Emergency state functions
    ////////////////////////

    /**
     * @notice Function to activate emergency state, which also enables the emergency mode on both PolygonRollupManager and PolygonZkEVMBridge contracts
     * If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period and an emergency state was not happened in the same period
     */
    function activateEmergencyState() external {
        if (!hasRole(_EMERGENCY_COUNCIL_ROLE, msg.sender)) {
            if (
                lastAggregationTimestamp == 0 ||
                lastAggregationTimestamp + _HALT_AGGREGATION_TIMEOUT >
                block.timestamp ||
                lastDeactivatedEmergencyStateTimestamp +
                    _HALT_AGGREGATION_TIMEOUT >
                block.timestamp
            ) {
                revert HaltTimeoutNotExpired();
            }
        }
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts
     */
    function deactivateEmergencyState()
        external
        onlyRole(_STOP_EMERGENCY_ROLE)
    {
        // Set last deactivated emergency state
        lastDeactivatedEmergencyStateTimestamp = uint64(block.timestamp);

        // Deactivate emergency state on PolygonZkEVMBridge
        bridgeAddress.deactivateEmergencyState();

        // Deactivate emergency state on this contract
        super._deactivateEmergencyState();
    }

    /**
     * @notice Internal function to activate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts
     */
    function _activateEmergencyState() internal override {
        // Activate emergency state on PolygonZkEVM Bridge
        bridgeAddress.activateEmergencyState();

        // Activate emergency state on this contract
        super._activateEmergencyState();
    }

    //////////////////
    // Setter functions
    //////////////////

    /**
     * @notice Set the aggregated rollup verifier of the system
     * @param newAggregateRollupVerifier new aggregated rollup verifier
     */
    function setAggregateRollupVerifier(
        IVerifierRollup newAggregateRollupVerifier
    ) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE) {
        aggregateRollupVerifier = newAggregateRollupVerifier;

        emit SetAggregateRollupVerifier(newAggregateRollupVerifier);
    }

    /**
     * @notice Set a new pending state timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newTrustedAggregatorTimeout Trusted aggregator timeout
     */
    function setTrustedAggregatorTimeout(
        uint64 newTrustedAggregatorTimeout
    ) external onlyRole(_TWEAK_PARAMETERS_ROLE) {
        if (!isEmergencyState) {
            if (newTrustedAggregatorTimeout >= trustedAggregatorTimeout) {
                revert NewTrustedAggregatorTimeoutMustBeLower();
            }
        }

        trustedAggregatorTimeout = newTrustedAggregatorTimeout;
        emit SetTrustedAggregatorTimeout(newTrustedAggregatorTimeout);
    }

    /**
     * @notice Set a new trusted aggregator timeout
     * The timeout can only be lowered, except if emergency state is active
     * @param newPendingStateTimeout Trusted aggregator timeout
     */
    function setPendingStateTimeout(
        uint64 newPendingStateTimeout
    ) external onlyRole(_TWEAK_PARAMETERS_ROLE) {
        if (!isEmergencyState) {
            if (newPendingStateTimeout >= pendingStateTimeout) {
                revert NewPendingStateTimeoutMustBeLower();
            }
        }

        pendingStateTimeout = newPendingStateTimeout;
        emit SetPendingStateTimeout(newPendingStateTimeout);
    }

    /**
     * @notice Set a new multiplier sequence fee
     * @param newMultiplierZkGasPrice multiplier sequence fee
     */
    function setMultiplierZkGasPrice(
        uint16 newMultiplierZkGasPrice
    ) external onlyRole(_TWEAK_PARAMETERS_ROLE) {
        if (newMultiplierZkGasPrice < 1000 || newMultiplierZkGasPrice > 1023) {
            revert InvalidRangeMultiplierZkGasPrice();
        }

        multiplierZkGasPrice = newMultiplierZkGasPrice;
        emit SetMultiplierZkGasPrice(newMultiplierZkGasPrice);
    }

    /**
     * @notice Set a new verify sequence time target
     * This value will only be relevant once the aggregation is decentralized, so
     * the trustedAggregatorTimeout should be zero or very close to zero
     * @param newVerifySequenceTimeTarget Verify sequence time target
     */
    function setVerifySequenceTimeTarget(
        uint64 newVerifySequenceTimeTarget
    ) external onlyRole(_TWEAK_PARAMETERS_ROLE) {
        if (newVerifySequenceTimeTarget > 1 days) {
            revert InvalidRangeSequenceTimeTarget();
        }
        verifySequenceTimeTarget = newVerifySequenceTimeTarget;
        emit SetVerifySequenceTimeTarget(newVerifySequenceTimeTarget);
    }

    /**
     * @notice Set the current zkgas price
     * @param newZkGasPrice new zkgas price
     */
    function setZkGasPrice(
        uint256 newZkGasPrice
    ) external onlyRole(_SET_FEE_ROLE) {
        // check fees min and max
        if (
            newZkGasPrice > _MAX_ZKGAS_PRICE || newZkGasPrice < _MIN_ZKGAS_PRICE
        ) {
            revert zkGasPriceOfRange();
        }
        _zkGasPrice = newZkGasPrice;
        emit SetSequenceFee(newZkGasPrice);
    }

    ////////////////////////
    // view/pure functions
    ///////////////////////

    /**
     * @notice Get the current rollup exit root
     * Compute using all the local exit roots of all rollups the rollup exit root
     * Since it's expected to have no more than 10 rollups in this first version, even if this approach
     * has a gas consumption that scales linearly with the rollups added, it's ok
     * In a future versions this computation will be done inside the circuit
     */
    function getRollupExitRoot() public view returns (bytes32) {
        uint256 currentNodes = rollupCount;

        // If there are no nodes return 0
        if (currentNodes == 0) {
            return bytes32(0);
        }

        // This array will contain the nodes of the current iteration
        bytes32[] memory tmpTree = new bytes32[](currentNodes);

        // In the first iteration the nodes will be the leafs which are the local exit roots of each network
        for (uint256 i = 0; i < currentNodes; i++) {
            // The first rollup ID starts on 1
            tmpTree[i] = rollupIDToRollupData[uint32(i + 1)].lastLocalExitRoot;
        }

        // This variable will keep track of the zero hashes
        bytes32 currentZeroHashHeight = 0;

        // This variable will keep track of the reamining levels to compute
        uint256 remainingLevels = _EXIT_TREE_DEPTH;

        // Calculate the root of the sub-tree that contains all the localExitRoots
        while (currentNodes != 1) {
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

            // Update tree variables
            tmpTree = nextTmpTree;
            currentNodes = nextIterationNodes;
            currentZeroHashHeight = keccak256(
                abi.encodePacked(currentZeroHashHeight, currentZeroHashHeight)
            );
            remainingLevels--;
        }

        bytes32 currentRoot = tmpTree[0];

        // Calculate remaining levels, since it's a sequencial merkle tree, the rest of the tree are zeroes
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

    /**
     * @notice Get the last verified sequence
     */
    function getLastVerifiedSequence(
        uint32 rollupID
    ) public view returns (uint64) {
        return _getLastVerifiedSequence(rollupIDToRollupData[rollupID]);
    }

    /**
     * @notice Get the last verified sequence
     */
    function _getLastVerifiedSequence(
        RollupDataSequenceBased storage rollup
    ) internal view returns (uint64) {
        if (rollup.lastPendingState > 0) {
            return
                rollup
                    .pendingStateTransitions[rollup.lastPendingState]
                    .lastVerifiedSequence;
        } else {
            return rollup.lastVerifiedSequenceNum;
        }
    }

    /**
     * @notice Returns a boolean that indicates if the pendingStateNum is or not consolidable
     * @param rollupID Rollup id
     * @param pendingStateNum Pending state number to check
     * Note that his function does not check if the pending state currently exists, or if it's consolidated already
     */
    function isPendingStateConsolidable(
        uint32 rollupID,
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
     * @param rollup Rollup data storage pointer
     * @param pendingStateNum Pending state number to check
     * Note that his function does not check if the pending state currently exists, or if it's consolidated already
     */
    function _isPendingStateConsolidable(
        RollupDataSequenceBased storage rollup,
        uint64 pendingStateNum
    ) internal view returns (bool) {
        return (rollup.pendingStateTransitions[pendingStateNum].timestamp +
            pendingStateTimeout <=
            block.timestamp);
    }

    /**
     * @notice Function to calculate the reward per zkGAs
     */
    function calculateRewardPerZkGas() public view returns (uint256) {
        uint256 currentBalance = pol.balanceOf(address(this));

        // Total Sequences to be verified = total Sequenced Sequences - total verified Sequences
        uint256 totalzkGasToVerify = totalZkGasLimit - totalVerifiedZkGasLimit;

        if (totalzkGasToVerify == 0) return 0;
        return currentBalance / totalzkGasToVerify;
    }

    /**
     * @notice Get zkGas price
     * This function is used instad of the automatic public view one,
     * because in a future might change the behaviour and we will be able to mantain the interface
     */
    function getZkGasPrice() public view returns (uint256) {
        return _zkGasPrice;
    }

    /**
     * @notice Get forced zkGas price
     */
    function getForcedZkGasPrice() public view returns (uint256) {
        return _zkGasPrice * 100;
    }

    /**
     * @notice Function to append the current rollup data to the input snark bytes
     * @param rollup Rollup storage pointer
     * @param initSequenceNum Storage pointer to a rollup
     * @param initSequenceNum Sequence which the aggregator starts the verification
     * @param finalSequenceNum Last sequence aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the sequence is processed
     * @param oldStateRoot State root before sequence is processed
     * @param newStateRoot New State root once the sequence is processed
     * @param ptrAccumulateInputSnarkBytes Memory pointer to the bytes array that will accumulate all rollups data to finally be used as the snark input
     */
    function _appendDataToInputSnarkBytes(
        RollupDataSequenceBased storage rollup,
        uint64 initSequenceNum,
        uint64 finalSequenceNum,
        bytes32 newLocalExitRoot,
        bytes32 oldStateRoot,
        bytes32 newStateRoot,
        uint256 ptrAccumulateInputSnarkBytes
    ) internal view returns (uint256) {
        // Sanity check
        bytes32 oldAccInputHash = rollup
            .sequences[initSequenceNum]
            .accInputHash;

        bytes32 newAccInputHash = rollup
            .sequences[finalSequenceNum]
            .accInputHash;

        // Sanity check
        if (initSequenceNum != 0 && oldAccInputHash == bytes32(0)) {
            revert OldAccInputHashDoesNotExist();
        }

        if (newAccInputHash == bytes32(0)) {
            revert NewAccInputHashDoesNotExist();
        }

        // Check that new state root is inside goldilocks field
        if (!_checkStateRootInsidePrime(uint256(newStateRoot))) {
            revert NewStateRootNotInsidePrime();
        }

        uint64 initBlobNum = rollup.sequences[initSequenceNum].currentBlobNum;

        uint64 finalBlobNum = rollup.sequences[finalSequenceNum].currentBlobNum;

        uint256 ptr = ptrAccumulateInputSnarkBytes;

        assembly {
            // store oldStateRoot
            mstore(ptr, oldStateRoot)
            ptr := add(ptr, 32)

            // store initBlobStateRoot
            // note this parameters is unused currently
            mstore(ptr, 0)
            ptr := add(ptr, 32)

            // store oldAccInputHash
            mstore(ptr, oldAccInputHash)
            ptr := add(ptr, 32)

            // store initBlobNum
            mstore(ptr, shl(192, initBlobNum)) // 256-64 = 192
            ptr := add(ptr, 8)

            // Review
            // store chainID
            // chainID is stored inside the rollup struct, on the first storage slot with 32 -(8 + 20) = 4 bytes offset
            mstore(ptr, shl(32, sload(rollup.slot)))
            ptr := add(ptr, 8)

            // store forkID
            // chainID is stored inside the rollup struct, on the second storage slot with 32 -(8 + 20) = 4 bytes offset
            mstore(ptr, shl(32, sload(add(rollup.slot, 1))))
            ptr := add(ptr, 8)

            // store newStateRoot
            mstore(ptr, newStateRoot)
            ptr := add(ptr, 32)

            // store newBlobStateRoot
            // note this parameters is unused currently
            mstore(ptr, 0)
            ptr := add(ptr, 32)

            // store newAccInputHash
            mstore(ptr, newAccInputHash)
            ptr := add(ptr, 32)

            // store finalBlobNum
            mstore(ptr, shl(192, finalBlobNum)) // 256-64 = 192
            ptr := add(ptr, 8)

            // store newLocalExitRoot
            mstore(ptr, newLocalExitRoot)
            ptr := add(ptr, 32)
        }

        return ptr;
    }

    /**
     * @notice Function to append the msg.sender to the snark bytes array
     * @param ptrAccumulateInputSnarkBytes Memory pointer to the bytes array that will accumulate all rollups data to finally be used as the snark input
     */
    function _appendSenderToInputSnarkBytes(
        uint256 ptrAccumulateInputSnarkBytes
    ) internal view {
        assembly {
            // store msg.sender, there's an extra 32 bytes at the end of the array for word manipulation, no need to worry about that bytes
            mstore(ptrAccumulateInputSnarkBytes, shl(96, caller())) // 256-160 = 96
        }
    }

    /**
     * @notice Function to check if the state root is inside of the prime field
     * @param newStateRoot New State root once the sequence is processed
     */
    function _checkStateRootInsidePrime(
        uint256 newStateRoot
    ) internal pure returns (bool) {
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

    /**
     * @notice Get rollup state root given a sequence number
     * @param rollupID Rollup identifier
     * @param sequenceNum Sequence number
     */
    function getRollupsequenceNumToStateRoot(
        uint32 rollupID,
        uint64 sequenceNum
    ) public view returns (bytes32) {
        return
            rollupIDToRollupData[rollupID].sequenceNumToStateRoot[sequenceNum];
    }

    /**
     * @notice Get rollup sequence sequences struct given a sequence number
     * @param rollupID Rollup identifier
     * @param sequenceNum Sequence number
     */
    function getRollupSequencedSequences(
        uint32 rollupID,
        uint64 sequenceNum
    ) public view returns (SequencedData memory) {
        return rollupIDToRollupData[rollupID].sequences[sequenceNum];
    }

    /**
     * @notice Get rollup sequence pending state struct given a sequence number
     * @param rollupID Rollup identifier
     * @param sequenceNum Sequence number
     */
    function getRollupPendingStateTransitions(
        uint32 rollupID,
        uint64 sequenceNum
    ) public view returns (PendingStateSequenceBased memory) {
        return
            rollupIDToRollupData[rollupID].pendingStateTransitions[sequenceNum];
    }
}
