// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./interfaces/IAgglayerGER.sol";
import "./interfaces/IPolygonZkEVMBridge.sol";
import "./interfaces/IPolygonRollupBase.sol";
import "./interfaces/IVerifierRollup.sol";
import "./lib/EmergencyManager.sol";
import "@openzeppelin/contracts-upgradeable4/token/ERC20/utils/SafeERC20Upgradeable.sol";
// @dev For ReentrancyGuardTransient there is no difference between upgradable and not upgradable contracts
import "@openzeppelin/contracts52/utils/ReentrancyGuardTransient.sol";
import "./lib/PolygonTransparentProxy.sol";
import "./lib/PolygonAccessControlUpgradeable.sol";
import "./lib/LegacyZKEVMStateVariables.sol";
import "./lib/PolygonConstantsBase.sol";
import "./interfaces/IPolygonPessimisticConsensus.sol";
import "./interfaces/ISP1Verifier.sol";
import "./interfaces/IAgglayerManager.sol";
import "./interfaces/IAggchainBase.sol";
import "./interfaces/IAgglayerGateway.sol";
import "./interfaces/IVersion.sol";
import "./lib/Hashes.sol";

/**
 * Contract responsible for managing rollups and the verification of their batches.
 * This contract will create and update rollups and store all the hashed sequenced data from them.
 * The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
 * them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.
 */
contract AgglayerManager is
    PolygonAccessControlUpgradeable,
    EmergencyManager,
    LegacyZKEVMStateVariables,
    PolygonConstantsBase,
    IAgglayerManager,
    ReentrancyGuardTransient,
    IVersion
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which to store the rollup type data
     * @param consensusImplementation Consensus implementation ( contains the consensus logic for the transparent proxy)
     * @param address verifier
     * @param forkID fork ID
     * @param rollupVerifierType Rollup compatibility ID, to check upgradability between rollup types
     * @param obsolete Indicates if the rollup type is obsolete
     * @param genesis Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupType {
        address consensusImplementation;
        address verifier;
        uint64 forkID;
        /// @custom:oz-renamed-from rollupCompatibilityID
        /// @custom:oz-retyped-from uint8
        VerifierType rollupVerifierType;
        bool obsolete;
        bytes32 genesis;
        bytes32 programVKey;
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
     * @param _legacyPendingStateTransitions Pending state mapping (deprecated)
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param _legacyLastPendingState Last pending state (deprecated)
     * @param _legacyLastPendingStateConsolidated Last pending state consolidated (deprecated)
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     * @param lastPessimisticRoot Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupData {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
        mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
        /// @custom:oz-renamed-from pendingStateTransitions
        mapping(uint256 pendingStateNum => PendingState) _legacyPendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        /// @custom:oz-renamed-from lastPendingState
        uint64 _legacyLastPendingState;
        /// @custom:oz-renamed-from lastPendingStateConsolidated
        uint64 _legacyLastPendingStateConsolidated;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        /// @custom:oz-renamed-from rollupCompatibilityID
        /// @custom:oz-retyped-from uint8
        VerifierType rollupVerifierType;
        bytes32 lastPessimisticRoot;
        bytes32 programVKey;
    }

    /**
     * @notice Struct to return all the necessary rollup info: VerifierType StateTransition
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param _legacyLastPendingState Last pending state (deprecated)
     * @param _legacyLastPendingStateConsolidated Last pending state consolidated (deprecated)
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     */
    struct RollupDataReturn {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 _legacyLastPendingState;
        uint64 _legacyLastPendingStateConsolidated;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        VerifierType rollupVerifierType;
    }

    /**
     * @notice Struct which to store the rollup data of each chain
     * @param rollupContract Rollup consensus contract, which manages everything
     * related to sequencing transactions
     * @param chainID Chain ID of the rollup
     * @param verifier Verifier contract
     * @param forkID ForkID of the rollup
     * @param lastLocalExitRoot Last exit root verified, used for compute the rollupExitRoot
     * @param lastBatchSequenced Last batch sent by the consensus contract
     * @param lastVerifiedBatch Last batch verified
     * @param lastVerifiedBatchBeforeUpgrade Last batch verified before the last upgrade
     * @param rollupTypeID Rollup type ID, can be 0 if it was added as an existing rollup
     * @param rollupVerifierType Rollup ID used for compatibility checks when upgrading
     * @param lastPessimisticRoot Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    struct RollupDataReturnV2 {
        address rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 lastVerifiedBatchBeforeUpgrade;
        uint64 rollupTypeID;
        VerifierType rollupVerifierType;
        bytes32 lastPessimisticRoot;
        bytes32 programVKey;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Max batch fee value
    uint256 internal constant _MAX_BATCH_FEE = 1000 ether;

    // Min value batch fee
    uint256 internal constant _MIN_BATCH_FEE = 1 gwei;

    // Goldilocks prime field
    uint256 internal constant _GOLDILOCKS_PRIME_FIELD = 0xFFFFFFFF00000001; // 2 ** 64 - 2 ** 32 + 1

    // Max uint64
    uint256 internal constant _MAX_UINT_64 = type(uint64).max; // 0xFFFFFFFFFFFFFFFF

    // Exit merkle tree levels
    uint256 internal constant _EXIT_TREE_DEPTH = 32;

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

    // Be able to that has priority to verify batches and consolidates the state instantly
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE =
        keccak256("TRUSTED_AGGREGATOR_ROLE");

    // Be able to set the trusted aggregator address
    bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE_ADMIN =
        keccak256("TRUSTED_AGGREGATOR_ROLE_ADMIN");

    // Be able to tweak parameters
    bytes32 internal constant _TWEAK_PARAMETERS_ROLE =
        keccak256("TWEAK_PARAMETERS_ROLE");

    // Be able to set the current batch fee
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

    // Current rollup manager version
    string public constant ROLLUP_MANAGER_VERSION = "v1.0.0";

    // Hardcoded address used to indicate that this address triggered in an event should not be considered as valid.
    address private constant _NO_ADDRESS =
        0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

    // Global Exit Root address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGER public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IPolygonZkEVMBridge public immutable bridgeAddress;

    // POL token address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IERC20Upgradeable public immutable pol;

    // Polygon Verifier Gateway address
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IAgglayerGateway public immutable aggLayerGateway;

    // Number of rollup types added, every new type will be assigned sequentially a new ID
    uint32 public rollupTypeCount;

    // Rollup type mapping
    /// @custom:oz-retyped-from PolygonRollupManagerPrevious.RollupType
    mapping(uint32 rollupTypeID => RollupType) public rollupTypeMap;

    // Number of rollups added, every new rollup will be assigned sequentially a new ID
    uint32 public rollupCount;

    // Rollups ID mapping
    /// @custom:oz-retyped-from PolygonRollupManagerPrevious.RollupData
    mapping(uint32 rollupID => RollupData) internal _rollupIDToRollupData;

    // Rollups address mapping
    mapping(address rollupAddress => uint32 rollupID) public rollupAddressToID;

    // Chain ID mapping for nullifying
    // note we will take care to avoid that current known chainIDs are not reused in our networks (example: 1)
    mapping(uint64 chainID => uint32 rollupID) public chainIDToRollupID;

    // Total sequenced batches across all rollups
    uint64 public totalSequencedBatches;

    // Total verified batches across all rollups
    uint64 public totalVerifiedBatches;

    // Last timestamp when an aggregation happen
    uint64 public lastAggregationTimestamp;

    // Trusted aggregator timeout, if a sequence is not verified in this time frame,
    // everyone can verify that sequence
    /// @custom:oz-renamed-from trustedAggregatorTimeout
    uint64 internal __legacyTrustedAggregatorTimeout;

    // Once a pending state exceeds this timeout it can be consolidated (deprecated)
    /// @custom:oz-renamed-from pendingStateTimeout
    uint64 internal __legacyPendingStateTimeout;

    // Time target of the verification of a batch
    // Adaptively the batchFee will be updated to achieve this target
    /// @custom:oz-renamed-from verifyBatchTimeTarget
    uint64 internal __legacyVerifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    /// @custom:oz-renamed-from multiplierBatchFee
    uint16 internal __legacyMultiplierBatchFee;

    // Current POL fee per batch sequenced
    // note This variable is internal, since the view function getBatchFee is likely to be upgraded
    uint256 internal _batchFee;

    // Timestamp when the last emergency state was deactivated
    uint64 public lastDeactivatedEmergencyStateTimestamp;

    // Mapping to track chains in migration
    mapping(uint32 rollupID => bool) public isRollupMigrating;

    /**
     * @dev Emitted when a new rollup type is added
     */
    event AddNewRollupType(
        uint32 indexed rollupTypeID,
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        VerifierType rollupVerifierType,
        bytes32 genesis,
        string description,
        bytes32 programVKey
    );

    /**
     * @dev Emitted when a a rollup type is obsoleted
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
        VerifierType rollupVerifierType,
        uint64 lastVerifiedBatchBeforeUpgrade,
        bytes32 programVKey,
        bytes32 initPessimisticRoot
    );

    /**
     * @dev Emitted when a rollup is updated
     */
    event UpdateRollup(
        uint32 indexed rollupID,
        uint32 newRollupTypeID,
        uint64 lastVerifiedBatchBeforeUpgrade
    );

    /**
     * @dev Emitted when a new verifier is added
     */
    event OnSequenceBatches(uint32 indexed rollupID, uint64 lastBatchSequenced);

    /**
     * @dev Emitted when the trusted aggregator verifies batches
     */
    event VerifyBatchesTrustedAggregator(
        uint32 indexed rollupID,
        uint64 numBatch,
        bytes32 stateRoot,
        bytes32 exitRoot,
        address indexed aggregator
    );

    /**
     * @dev Emitted when rollback batches
     */
    event RollbackBatches(
        uint32 indexed rollupID,
        uint64 indexed targetBatch,
        bytes32 accInputHashToRollback
    );

    /**
     * @dev Emitted when is updated the trusted aggregator address
     */
    event SetTrustedAggregator(address newTrustedAggregator);

    /**
     * @dev Emitted when is updated the batch fee
     */
    event SetBatchFee(uint256 newBatchFee);

    /**
     * @dev Emitted when rollup manager is upgraded
     */
    event UpdateRollupManagerVersion(string rollupManagerVersion);

    /**
     * @notice Emitted when a ALGateway or Pessimistic chain verifies a pessimistic proof
     * @param rollupID Rollup ID
     * @param prevPessimisticRoot Previous pessimistic root
     * @param newPessimisticRoot New pessimistic root
     * @param prevLocalExitRoot Previous local exit root
     * @param newLocalExitRoot New local exit root
     * @param l1InfoRoot L1 info root
     * @param trustedAggregator Trusted aggregator address
     */
    event VerifyPessimisticStateTransition(
        uint32 indexed rollupID,
        bytes32 prevPessimisticRoot,
        bytes32 newPessimisticRoot,
        bytes32 prevLocalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 l1InfoRoot,
        address indexed trustedAggregator
    );

    /**
     * @dev Emitted when a new rollup is created based on a rollupType
     */
    event CreateNewAggchain(
        uint32 indexed rollupID,
        uint32 rollupTypeID,
        address rollupAddress,
        uint64 chainID,
        uint8 rollupVerifierType,
        bytes initializeBytesAggchain
    );

    /**
     * @dev Emitted when `initMigration` is called
     * @param rollupID Rollup ID that is being migrated
     * @param newRollupTypeID New rollup type ID that the rollup will be migrated to
     */
    event InitMigration(uint32 indexed rollupID, uint32 newRollupTypeID);

    /**
     * @dev Emitted when a rollup completes the migration to Pessimistic or ALGateway, just after proving bootstrapped batch
     * @param rollupID Rollup ID that completed the migration
     */
    event CompletedMigration(uint32 indexed rollupID);

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _aggLayerGateway Polygon Verifier Gateway address
     */
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridge _bridgeAddress,
        IAgglayerGateway _aggLayerGateway
    ) {
        // Check non zero inputs
        if (
            address(_globalExitRootManager) == address(0) ||
            address(_pol) == address(0) ||
            address(_bridgeAddress) == address(0) ||
            address(_aggLayerGateway) == address(0)
        ) {
            revert InvalidConstructorInputs();
        }
        globalExitRootManager = _globalExitRootManager;
        pol = _pol;
        bridgeAddress = _bridgeAddress;
        aggLayerGateway = _aggLayerGateway;

        // Disable initializers on the implementation following the best practices
        _disableInitializers();
    }

    /**
     * Initializer function to set new rollup manager version
     */
    function initialize() external virtual reinitializer(5) {
        emit UpdateRollupManagerVersion(ROLLUP_MANAGER_VERSION);
    }

    ///////////////////////////////////////
    // Rollups management functions
    ///////////////////////////////////////

    ////////////////
    // Rollups Types
    ////////////////

    /**
     * @notice Add a new rollup type
     * @param consensusImplementation Consensus implementation
     * @param verifier Verifier address
     * @param forkID ForkID of the verifier
     * @param rollupVerifierType rollup verifier type
     * @param genesis Genesis block of the rollup
     * @param description Description of the rollup type
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     */
    function addNewRollupType(
        address consensusImplementation,
        address verifier,
        uint64 forkID,
        VerifierType rollupVerifierType,
        bytes32 genesis,
        string memory description,
        bytes32 programVKey
    ) external onlyRole(_ADD_ROLLUP_TYPE_ROLE) {
        // Check proposed address is not this contract to avoid self-referential loops causing infinite delegate calls
        if (consensusImplementation == address(this)) {
            revert InvalidImplementationAddress();
        }

        uint32 rollupTypeID = ++rollupTypeCount;

        if (rollupVerifierType == VerifierType.Pessimistic) {
            // No genesis on pessimistic rollups
            if (genesis != bytes32(0)) revert InvalidRollupType();
        } else if (rollupVerifierType == VerifierType.ALGateway) {
            // Those params should be zero for ALGateway rollup types
            if (
                verifier != address(0) ||
                forkID != 0 ||
                genesis != bytes32(0) ||
                programVKey != bytes32(0)
            ) revert InvalidRollupType();
        } else if (rollupVerifierType == VerifierType.StateTransition) {
            // No programVKey on state transition rollups
            if (programVKey != bytes32(0)) revert InvalidRollupType();
        } else {
            // unreachable code since solidity enforces the enum input rollupVerifierType to be one of the enum values
            revert InvalidRollupType();
        }

        rollupTypeMap[rollupTypeID] = RollupType({
            consensusImplementation: consensusImplementation,
            verifier: verifier,
            forkID: forkID,
            rollupVerifierType: rollupVerifierType,
            obsolete: false,
            genesis: genesis,
            programVKey: programVKey
        });

        emit AddNewRollupType(
            rollupTypeID,
            consensusImplementation,
            verifier,
            forkID,
            rollupVerifierType,
            genesis,
            description,
            programVKey
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
        if (currentRollupType.obsolete) {
            revert RollupTypeObsolete();
        }

        currentRollupType.obsolete = true;

        emit ObsoleteRollupType(rollupTypeID);
    }

    /**
     * @notice Create a new rollup
     * @param rollupTypeID Rollup type to deploy
     * @param chainID ChainID of the rollup, must be a new one, can not have more than 32 bits
     * @param initializeBytesAggchain Encoded params to initialize the chain. Each aggchain has its encoded params.
     * @dev in case of rollupType state transition or pessimistic, the encoded params
     * are the following: (address admin, address sequencer, address gasTokenAddress, string sequencerURL, string networkName)
     */
    function attachAggchainToAL(
        uint32 rollupTypeID,
        uint64 chainID,
        bytes memory initializeBytesAggchain
    ) external onlyRole(_CREATE_ROLLUP_ROLE) {
        // Check that rollup type exists
        if (rollupTypeID == 0 || rollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }
        // Check rollup type is not obsolete
        RollupType storage rollupType = rollupTypeMap[rollupTypeID];
        if (rollupType.obsolete) {
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

        // Set chainID to rollup id mapping
        chainIDToRollupID[chainID] = rollupID;
        // Set rollup address to rollup id mapping
        rollupAddressToID[rollupAddress] = rollupID;

        // Set rollup data
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollup.rollupContract = rollupAddress;
        rollup.chainID = chainID;
        rollup.rollupTypeID = rollupTypeID;
        rollup.rollupVerifierType = rollupType.rollupVerifierType;

        if (rollupType.rollupVerifierType == VerifierType.ALGateway) {
            // Emit create new aggchain event
            emit CreateNewAggchain(
                rollupID,
                rollupTypeID,
                rollupAddress,
                chainID,
                uint8(rollupType.rollupVerifierType),
                initializeBytesAggchain
            );

            // This event is emitted for backwards compatibility
            /// @dev the address is hardcoded as it doesn't apply for aggchains and zero address is used for ether
            emit CreateNewRollup(
                rollupID,
                rollupTypeID,
                rollupAddress,
                chainID,
                _NO_ADDRESS
            );

            address aggchainManager = abi.decode(
                initializeBytesAggchain,
                (address)
            );

            // Set the aggchain manager, aggchain contract will be initialized later
            // through the aggchain manager
            IAggchainBase(rollupAddress).initAggchainManager(aggchainManager);
        } else {
            // assign non ALGateway values to rollup data
            rollup.forkID = rollupType.forkID;
            rollup.verifier = rollupType.verifier;
            rollup.batchNumToStateRoot[0] = rollupType.genesis;
            rollup.programVKey = rollupType.programVKey;

            // custom parsing of the initializeBytesAggchain for a sate transition or pessimistic rollup
            (
                address admin,
                address sequencer,
                address gasTokenAddress,
                string memory sequencerURL,
                string memory networkName
            ) = abi.decode(
                    initializeBytesAggchain,
                    (address, address, address, string, string)
                );

            // Emit create new rollup event
            emit CreateNewRollup(
                rollupID,
                rollupTypeID,
                rollupAddress,
                chainID,
                gasTokenAddress
            );

            // Initialize new rollup
            IPolygonRollupBase(rollupAddress).initialize(
                admin,
                sequencer,
                rollupID,
                gasTokenAddress,
                sequencerURL,
                networkName
            );
        }
    }

    /**
     * @notice Add an already deployed rollup
     * note that this rollup does not follow any rollupType
     * @param rollupAddress Rollup address
     * @param verifier Verifier address, must be added before
     * @param forkID Fork id of the added rollup
     * @param chainID Chain id of the added rollup
     * @param initRoot Genesis block for StateTransitionChains & localExitRoot for pessimistic chain
     * @param rollupVerifierType Compatibility ID for the added rollup
     * @param programVKey Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1
     * @param initPessimisticRoot Pessimistic root to init the chain.
     */
    function addExistingRollup(
        address rollupAddress,
        address verifier,
        uint64 forkID,
        uint64 chainID,
        bytes32 initRoot,
        VerifierType rollupVerifierType,
        bytes32 programVKey,
        bytes32 initPessimisticRoot
    ) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE) {
        // Check chainID nullifier
        if (chainIDToRollupID[chainID] != 0) {
            revert ChainIDAlreadyExist();
        }

        // check chainID max value
        // Currently we have this limitation by the circuit, might be removed in a future
        if (chainID > type(uint32).max) {
            revert ChainIDOutOfRange();
        }

        // Check if rollup address was already added
        if (rollupAddressToID[address(rollupAddress)] != 0) {
            revert RollupAddressAlreadyExist();
        }

        // Check proposed address is not this contract to avoid self-referential loops causing infinite delegate calls
        if (rollupAddress == address(this) || rollupAddress.code.length == 0) {
            revert InvalidImplementationAddress();
        }

        // Increment rollup count
        uint32 rollupID = ++rollupCount;

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        // Store rollup data
        rollupAddressToID[address(rollupAddress)] = rollupID;

        RollupData storage rollup = _rollupIDToRollupData[rollupID];
        rollup.rollupContract = rollupAddress;
        rollup.forkID = forkID;
        rollup.verifier = verifier;
        rollup.chainID = chainID;
        rollup.rollupVerifierType = rollupVerifierType;

        // Check verifier type
        if (rollupVerifierType == VerifierType.Pessimistic) {
            rollup.programVKey = programVKey;
            rollup.lastPessimisticRoot = initPessimisticRoot;
            rollup.lastLocalExitRoot = initRoot;
            if (verifier.code.length == 0) {
                revert InvalidVerifierAddress();
            }
        } else if (rollupVerifierType == VerifierType.ALGateway) {
            if (
                verifier != address(0) ||
                forkID != 0 ||
                programVKey != bytes32(0)
            ) {
                revert InvalidInputsForRollupType();
            }

            rollup.lastPessimisticRoot = initPessimisticRoot;
            rollup.lastLocalExitRoot = initRoot;
        } else {
            if (
                programVKey != bytes32(0) || initPessimisticRoot != bytes32(0)
            ) {
                revert InvalidInputsForRollupType();
            }

            rollup.batchNumToStateRoot[0] = initRoot;
            if (verifier.code.length == 0) {
                revert InvalidVerifierAddress();
            }
        }

        emit AddExistingRollup(
            rollupID,
            forkID,
            address(rollupAddress),
            chainID,
            rollupVerifierType,
            0,
            programVKey,
            initPessimisticRoot
        );
    }

    /**
     * @notice Upgrade an existing rollup from the rollup admin address
     * This address is able to update the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
     */
    function updateRollupByRollupAdmin(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID
    ) external {
        RollupData storage rollup = _rollupIDToRollupData[
            rollupAddressToID[address(rollupContract)]
        ];

        if (rollup.rollupVerifierType == VerifierType.ALGateway) {
            // Check aggchain manager is msg.sender
            if (
                IAggchainBase(address(rollupContract)).aggchainManager() !=
                msg.sender
            ) {
                revert OnlyAggchainManager();
            }

            // Check AGGCHAIN_TYPE is the same (both are ALGateway at this point)
            if (
                IAggchainBase(address(rollupContract)).AGGCHAIN_TYPE() !=
                IAggchainBase(
                    rollupTypeMap[newRollupTypeID].consensusImplementation
                ).AGGCHAIN_TYPE()
            ) {
                revert UpdateNotCompatible();
            }
        } else {
            // Check admin of the network is msg.sender
            if (
                IPolygonRollupBase(address(rollupContract)).admin() !=
                msg.sender
            ) {
                revert OnlyRollupAdmin();
            }

            // Check all sequenced batches are verified
            if (rollup.lastBatchSequenced != rollup.lastVerifiedBatch) {
                revert AllSequencedMustBeVerified();
            }
        }

        // Not allowed to update to an older rollup type id, only supported from updateRollup function
        // Rollups added via 'addExistingRollup' has rollupTypeID = 0
        if (rollup.rollupTypeID >= newRollupTypeID) {
            revert UpdateToOldRollupTypeID();
        }

        // note that for rollups via 'addExistingRollup', the rollupTypeID is set to 0
        // Admin can't update to a different rollup type
        if (
            rollup.rollupVerifierType !=
            rollupTypeMap[newRollupTypeID].rollupVerifierType
        ) {
            revert UpdateNotCompatible();
        }

        _updateRollup(rollupContract, newRollupTypeID, new bytes(0));
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function updateRollup(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        RollupData storage rollup = _rollupIDToRollupData[rollupID];
        // Only allow update rollupVerifierType when updating to ALGateway
        if (
            rollupTypeMap[newRollupTypeID].rollupVerifierType !=
            VerifierType.ALGateway &&
            rollup.rollupVerifierType !=
            rollupTypeMap[newRollupTypeID].rollupVerifierType
        ) {
            revert UpdateNotCompatible();
        }

        _updateRollup(rollupContract, newRollupTypeID, upgradeData);
    }

    /**
     * @notice Upgrade an existing rollup
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rollupTypeID to upgrade to
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

        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // The update must be to a new rollup type
        if (rollup.rollupTypeID == newRollupTypeID) {
            revert UpdateToSameRollupTypeID();
        }

        RollupType storage newRollupType = rollupTypeMap[newRollupTypeID];

        // Check rollup type is not obsolete
        if (newRollupType.obsolete) {
            revert RollupTypeObsolete();
        }

        // Update rollup parameters
        rollup.verifier = newRollupType.verifier;
        rollup.forkID = newRollupType.forkID;
        rollup.programVKey = newRollupType.programVKey;
        rollup.rollupTypeID = newRollupTypeID;
        rollup.rollupVerifierType = newRollupType.rollupVerifierType;

        uint64 lastVerifiedBatch = getLastVerifiedBatch(rollupID);
        rollup.lastVerifiedBatchBeforeUpgrade = lastVerifiedBatch;
        // Upgrade rollup
        rollupContract.upgradeToAndCall(
            newRollupType.consensusImplementation,
            upgradeData
        );
        emit UpdateRollup(rollupID, newRollupTypeID, lastVerifiedBatch);
    }

    /**
     * @notice Function to init migration to PP or ALGateway
     * @param rollupID Rollup ID that is being migrated
     * @param newRollupTypeID New rollup type ID that the rollup will be migrated to
     * @param upgradeData Upgrade data
     */
    function initMigration(
        uint32 rollupID,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        /// @dev Rollup existence check is done at `_updateRollup`function
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // Only for StateTransition chains
        require(
            rollup.rollupVerifierType == VerifierType.StateTransition,
            OnlyStateTransitionChains()
        );

        // No pending batches to verify allowed before migration
        if (rollup.lastBatchSequenced != rollup.lastVerifiedBatch) {
            revert AllSequencedMustBeVerified();
        }

        // NewRollupType must be pessimistic or ALGateway
        require(
            rollupTypeMap[newRollupTypeID].rollupVerifierType !=
                VerifierType.StateTransition,
            NewRollupTypeMustBePessimisticOrALGateway()
        );

        // Add rollupID to migration mapping
        isRollupMigrating[rollupID] = true;

        // Update rollup type to new type
        _updateRollup(
            ITransparentUpgradeableProxy(rollup.rollupContract),
            newRollupTypeID,
            upgradeData
        );

        // Emit event
        emit InitMigration(rollupID, newRollupTypeID);
    }

    /**
     * @notice Rollback batches of the target rollup
     * Only applies to state transition rollups
     * @param rollupContract Rollup consensus proxy address
     * @param targetBatch Batch to rollback up to but not including this batch
     */
    function rollbackBatches(
        IPolygonRollupBase rollupContract,
        uint64 targetBatch
    ) external nonReentrant {
        // Check msg.sender has _UPDATE_ROLLUP_ROLE rol or is the admin of the network
        if (
            !hasRole(_UPDATE_ROLLUP_ROLE, msg.sender) &&
            IPolygonRollupBase(address(rollupContract)).admin() != msg.sender
        ) {
            revert NotAllowedAddress();
        }

        // Check the rollup exists
        uint32 rollupID = rollupAddressToID[address(rollupContract)];
        if (rollupID == 0) {
            revert RollupMustExist();
        }

        // Load rollup
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        if (rollup.rollupVerifierType != VerifierType.StateTransition) {
            revert OnlyStateTransitionChains();
        }

        uint64 lastBatchSequenced = rollup.lastBatchSequenced;

        // Batch to rollback should be already sequenced
        if (
            targetBatch >= lastBatchSequenced ||
            targetBatch < rollup.lastVerifiedBatch
        ) {
            revert RollbackBatchIsNotValid();
        }

        uint64 currentBatch = lastBatchSequenced;

        // delete sequence batches structs until the targetBatch
        while (currentBatch != targetBatch) {
            // Load previous end of sequence batch
            uint64 previousBatch = rollup
                .sequencedBatches[currentBatch]
                .previousLastBatchSequenced;

            // Batch to rollback must be end of a sequence
            if (previousBatch < targetBatch) {
                revert RollbackBatchIsNotEndOfSequence();
            }

            // delete sequence information
            delete rollup.sequencedBatches[currentBatch];

            // Update current batch for next iteration
            currentBatch = previousBatch;
        }

        // Update last batch sequenced on rollup data
        rollup.lastBatchSequenced = targetBatch;

        // Update totalSequencedBatches
        totalSequencedBatches -= lastBatchSequenced - targetBatch;

        // Clean pending state if any
        rollupContract.rollbackBatches(
            targetBatch,
            rollup.sequencedBatches[targetBatch].accInputHash
        );

        emit RollbackBatches(
            rollupID,
            targetBatch,
            rollup.sequencedBatches[targetBatch].accInputHash
        );
    }

    /////////////////////////////////////
    // Sequence/Verify batches functions
    ////////////////////////////////////

    /**
     * @notice Sequence batches, callback called by one of the consensus managed by this contract
     * @param newSequencedBatches Number of batches sequenced
     * @param newAccInputHash New accumulate input hash
     */
    function onSequenceBatches(
        uint64 newSequencedBatches,
        bytes32 newAccInputHash
    ) external ifNotEmergencyState returns (uint64) {
        // Check that the msg.sender is an added rollup
        uint32 rollupID = rollupAddressToID[msg.sender];
        if (rollupID == 0) {
            revert SenderMustBeRollup();
        }

        // This prevents overwriting sequencedBatches
        if (newSequencedBatches == 0) {
            revert MustSequenceSomeBatch();
        }

        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        if (rollup.rollupVerifierType != VerifierType.StateTransition) {
            revert OnlyStateTransitionChains();
        }

        // Update total sequence parameters
        totalSequencedBatches += newSequencedBatches;

        // Update sequenced batches of the current rollup
        uint64 previousLastBatchSequenced = rollup.lastBatchSequenced;
        uint64 newLastBatchSequenced = previousLastBatchSequenced +
            newSequencedBatches;

        rollup.lastBatchSequenced = newLastBatchSequenced;
        rollup.sequencedBatches[newLastBatchSequenced] = SequencedBatchData({
            accInputHash: newAccInputHash,
            sequencedTimestamp: uint64(block.timestamp),
            previousLastBatchSequenced: previousLastBatchSequenced
        });

        emit OnSequenceBatches(rollupID, newLastBatchSequenced);

        return newLastBatchSequenced;
    }

    /**
     * @notice Allows a trusted aggregator to verify multiple batches
     * @param rollupID Rollup identifier
     * @param pendingStateNum Init pending state, 0 if consolidated state is used (deprecated)
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param beneficiary Address that will receive the verification reward
     * @param proof Fflonk proof
     */
    function verifyBatchesTrustedAggregator(
        uint32 rollupID,
        uint64 pendingStateNum,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        address beneficiary,
        bytes32[24] calldata proof
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) {
        // Pending state became deprecated,
        // It's still there just to have backwards compatibility interface
        if (pendingStateNum != 0) {
            revert PendingStateNumExist();
        }

        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        if (rollup.rollupVerifierType != VerifierType.StateTransition) {
            revert OnlyStateTransitionChains();
        }

        _verifyAndRewardBatches(
            rollup,
            initNumBatch,
            finalNewBatch,
            newLocalExitRoot,
            newStateRoot,
            beneficiary,
            proof
        );

        // Consolidate state
        rollup.lastVerifiedBatch = finalNewBatch;
        rollup.batchNumToStateRoot[finalNewBatch] = newStateRoot;
        rollup.lastLocalExitRoot = newLocalExitRoot;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        emit VerifyBatchesTrustedAggregator(
            rollupID,
            finalNewBatch,
            newStateRoot,
            newLocalExitRoot,
            msg.sender
        );
    }

    /**
     * @notice Verify and reward batches internal function
     * @param rollup Rollup Data storage pointer that will be used to the verification
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param beneficiary Address that will receive the verification reward
     * @param proof Fflonk proof
     */
    function _verifyAndRewardBatches(
        RollupData storage rollup,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        address beneficiary,
        bytes32[24] calldata proof
    ) internal virtual {
        bytes32 oldStateRoot;

        uint64 currentLastVerifiedBatch = _getLastVerifiedBatch(rollup);

        if (initNumBatch < rollup.lastVerifiedBatchBeforeUpgrade) {
            revert InitBatchMustMatchCurrentForkID();
        }

        // Use consolidated state
        oldStateRoot = rollup.batchNumToStateRoot[initNumBatch];

        if (oldStateRoot == bytes32(0)) {
            revert OldStateRootDoesNotExist();
        }

        // Check initNumBatch is inside the range, sanity check
        if (initNumBatch > currentLastVerifiedBatch) {
            revert InitNumBatchAboveLastVerifiedBatch();
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

        // Calculate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        if (
            !IVerifierRollup(rollup.verifier).verifyProof(proof, [inputSnark])
        ) {
            revert InvalidProof();
        }

        // Pay POL rewards
        uint64 newVerifiedBatches = finalNewBatch - currentLastVerifiedBatch;

        pol.safeTransfer(
            beneficiary,
            calculateRewardPerBatch() * newVerifiedBatches
        );

        // Update aggregation parameters
        totalVerifiedBatches += newVerifiedBatches;
        lastAggregationTimestamp = uint64(block.timestamp);

        // Callback to the rollup address
        IPolygonRollupBase(rollup.rollupContract).onVerifyBatches(
            finalNewBatch,
            newStateRoot,
            msg.sender
        );
    }

    /**
     * @notice Allows a trusted aggregator to verify pessimistic proof
     * @param rollupID Rollup identifier
     * @param l1InfoTreeLeafCount Count of the L1InfoTree leaf that will be used to verify imported bridge exits
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     * @param proof SP1 proof (Plonk)
     * @param aggchainData Specific custom data to verify Aggregation layer chains
     * @dev A reentrancy measure has been applied because this function calls `onVerifyPessimistic`, is an open function implemented by the aggchains
     * @dev the function can not be a view because the nonReentrant uses a transient storage variable
     */
    function verifyPessimisticTrustedAggregator(
        uint32 rollupID,
        uint32 l1InfoTreeLeafCount,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata proof,
        bytes calldata aggchainData
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) nonReentrant {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        // Not for state transition chains
        if (rollup.rollupVerifierType == VerifierType.StateTransition) {
            revert StateTransitionChainsNotAllowed();
        }

        // Not aggchainData for VerifierType.Pessimistic
        if (
            rollup.rollupVerifierType == VerifierType.Pessimistic &&
            aggchainData.length != 0
        ) {
            revert AggchainDataMustBeZeroForPessimisticVerifierType();
        }

        // Check l1InfoTreeLeafCount has a valid l1InfoTreeRoot
        bytes32 l1InfoRoot = globalExitRootManager.l1InfoRootMap(
            l1InfoTreeLeafCount
        );

        if (l1InfoRoot == bytes32(0)) {
            revert L1InfoTreeLeafCountInvalid();
        }

        // In case of a chain in migration, the inputs are a special case.
        if (isRollupMigrating[rollupID]) {
            // If we are migrating, the proof is proving a "bootstrapCertificate" containing all the bridges involved in the network since the genesis.
            // It's a hard requirement that the newLocalExitRoot matches the current lastLocalExitRoot meaning that the certificates covers all the bridges
            /// @dev  If the lastLocalExitRoot is zero, it means that the rollup has never verified a batch with bridges.
            ///       In this special case, newLocalExitRoot must also be zero as defined in the PP program circuit.
            require(
                newLocalExitRoot == rollup.lastLocalExitRoot,
                InvalidNewLocalExitRoot()
            );
            // In this special case, we consider lastLocalExitRoot is zero.
            // This is intentional, as we need a valid prover input.
            // Since the proof includes all bridges involved in the network, we assume
            // lastLocalExitRoot is bytes32(0), and the expectedNewLocalExitRoot will
            // already contain the full network state (lastLocalExitRoot).
            rollup.lastLocalExitRoot = bytes32(0);
            // Finally, after proving the "bootstrapCertificate", the migration will be completed
            isRollupMigrating[rollupID] = false;

            // Emit event
            emit CompletedMigration(rollupID);
        }

        bytes memory inputPessimisticBytes = _getInputPessimisticBytes(
            rollupID,
            rollup,
            l1InfoRoot,
            newLocalExitRoot,
            newPessimisticRoot,
            aggchainData
        );

        if (rollup.rollupVerifierType == VerifierType.ALGateway) {
            // Verify proof. The pessimistic proof selector is attached at the first 4 bytes of the proof
            // proof[0:4]: 4 bytes selector pp
            // proof[4:8]: 4 bytes selector SP1 verifier
            // proof[8:]: proof
            aggLayerGateway.verifyPessimisticProof(
                inputPessimisticBytes,
                proof
            );
        } else {
            // Verify proof
            ISP1Verifier(rollup.verifier).verifyProof(
                rollup.programVKey,
                inputPessimisticBytes,
                proof
            );
        }

        // Update aggregation parameters
        lastAggregationTimestamp = uint64(block.timestamp);

        // Consolidate state
        bytes32 prevLocalExitRoot = rollup.lastLocalExitRoot;
        rollup.lastLocalExitRoot = newLocalExitRoot;
        bytes32 prevPessimisticRoot = rollup.lastPessimisticRoot;
        rollup.lastPessimisticRoot = newPessimisticRoot;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        // Same event as verifyBatches to support current bridge service to synchronize everything
        /// @dev moved newLocalExitRoot to aux variable to avoid stack too deep errors at compilation
        bytes32 newLocalExitRootAux = newLocalExitRoot;
        emit VerifyBatchesTrustedAggregator(
            rollupID,
            0, // final batch: does not  apply in pessimistic
            bytes32(0), // new state root: does not apply in pessimistic
            newLocalExitRootAux,
            msg.sender
        );

        /// @dev emit a second event with more data, not updated/removed the other one for backwards compatibility reasons
        emit VerifyPessimisticStateTransition(
            rollupID,
            prevPessimisticRoot,
            newPessimisticRoot,
            prevLocalExitRoot,
            newLocalExitRootAux,
            l1InfoRoot,
            msg.sender
        );

        if (rollup.rollupVerifierType == VerifierType.ALGateway) {
            // Allow chains to manage customData
            // Callback to the rollup address
            IAggchainBase(rollup.rollupContract).onVerifyPessimistic(
                aggchainData
            );
        }
    }

    ////////////////////////
    // Emergency state functions
    ////////////////////////

    /**
     * @notice Function to activate emergency state, which also enables the emergency mode on both AgglayerManager and PolygonZkEVMBridge contracts
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
     * @notice Function to deactivate emergency state on both AgglayerManager and PolygonZkEVMBridge contracts
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
     * @notice Internal function to activate emergency state on both AgglayerManager and PolygonZkEVMBridge contracts
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
     * @notice Set the current batch fee
     * @param newBatchFee new batch fee
     */
    function setBatchFee(uint256 newBatchFee) external onlyRole(_SET_FEE_ROLE) {
        // check fees min and max
        if (newBatchFee > _MAX_BATCH_FEE || newBatchFee < _MIN_BATCH_FEE) {
            revert BatchFeeOutOfRange();
        }
        _batchFee = newBatchFee;
        emit SetBatchFee(newBatchFee);
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
            tmpTree[i] = _rollupIDToRollupData[uint32(i + 1)].lastLocalExitRoot;
        }

        // This variable will keep track of the zero hashes
        bytes32 currentZeroHashHeight = 0;

        // This variable will keep track of the remaining levels to compute
        uint256 remainingLevels = _EXIT_TREE_DEPTH;

        // Calculate the root of the sub-tree that contains all the localExitRoots
        while (currentNodes != 1) {
            uint256 nextIterationNodes = currentNodes / 2 + (currentNodes % 2);
            bytes32[] memory nextTmpTree = new bytes32[](nextIterationNodes);
            for (uint256 i = 0; i < nextIterationNodes; i++) {
                // if we are on the last iteration of the current level and the nodes are odd
                if (i == nextIterationNodes - 1 && (currentNodes % 2) == 1) {
                    nextTmpTree[i] = Hashes.efficientKeccak256(
                        tmpTree[i * 2],
                        currentZeroHashHeight
                    );
                } else {
                    nextTmpTree[i] = Hashes.efficientKeccak256(
                        tmpTree[i * 2],
                        tmpTree[(i * 2) + 1]
                    );
                }
            }

            // Update tree variables
            tmpTree = nextTmpTree;
            currentNodes = nextIterationNodes;
            currentZeroHashHeight = Hashes.efficientKeccak256(
                currentZeroHashHeight,
                currentZeroHashHeight
            );
            remainingLevels--;
        }

        bytes32 currentRoot = tmpTree[0];

        // Calculate remaining levels, since it's a sequential merkle tree, the rest of the tree are zeroes
        for (uint256 i = 0; i < remainingLevels; i++) {
            currentRoot = Hashes.efficientKeccak256(
                currentRoot,
                currentZeroHashHeight
            );
            currentZeroHashHeight = Hashes.efficientKeccak256(
                currentZeroHashHeight,
                currentZeroHashHeight
            );
        }
        return currentRoot;
    }

    /**
     * @notice Get the last verified batch
     */
    function getLastVerifiedBatch(
        uint32 rollupID
    ) public view returns (uint64) {
        return _getLastVerifiedBatch(_rollupIDToRollupData[rollupID]);
    }

    /**
     * @notice Get the last verified batch
     */
    function _getLastVerifiedBatch(
        RollupData storage rollup
    ) internal view returns (uint64) {
        return rollup.lastVerifiedBatch;
    }

    /**
     * @notice Function to calculate the reward to verify a single batch
     */
    function calculateRewardPerBatch() public view returns (uint256) {
        uint256 currentBalance = pol.balanceOf(address(this));

        // Total Batches to be verified = total Sequenced Batches - total verified Batches
        uint256 totalBatchesToVerify = totalSequencedBatches -
            totalVerifiedBatches;

        if (totalBatchesToVerify == 0) return 0;
        return currentBalance / totalBatchesToVerify;
    }

    /**
     * @notice Get batch fee
     * This function is used instead of the automatic public view one,
     * because in a future might change the behavior and we will be able to maintain the interface
     */
    function getBatchFee() public view returns (uint256) {
        return _batchFee;
    }

    /**
     * @notice Get forced batch fee
     */
    function getForcedBatchFee() public view returns (uint256) {
        return _batchFee * 100;
    }

    /**
     * @notice Function to calculate the pessimistic input bytes
     * @param rollupID Rollup id used to calculate the input snark bytes
     * @param l1InfoTreeRoot L1 Info tree root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     * @param aggchainData Specific custom data to verify Aggregation layer chains
     */
    function getInputPessimisticBytes(
        uint32 rollupID,
        bytes32 l1InfoTreeRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata aggchainData
    ) external view returns (bytes memory) {
        return
            _getInputPessimisticBytes(
                rollupID,
                _rollupIDToRollupData[rollupID],
                l1InfoTreeRoot,
                newLocalExitRoot,
                newPessimisticRoot,
                aggchainData
            );
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param rollupID Rollup identifier
     * @param rollup Rollup data storage pointer
     * @param l1InfoTreeRoot L1 Info tree root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     */
    function _getInputPessimisticBytes(
        uint32 rollupID,
        RollupData storage rollup,
        bytes32 l1InfoTreeRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata aggchainData
    ) internal view returns (bytes memory inputPessimisticBytes) {
        // Different consensusHash and encoding if the rollup is ALGateway or pessimistic
        if (rollup.rollupVerifierType == VerifierType.ALGateway) {
            bytes32 aggchainHash = IAggchainBase(rollup.rollupContract)
                .getAggchainHash(aggchainData);

            inputPessimisticBytes = abi.encodePacked(
                rollup.lastLocalExitRoot,
                rollup.lastPessimisticRoot,
                l1InfoTreeRoot,
                rollupID,
                aggchainHash,
                newLocalExitRoot,
                newPessimisticRoot
            );
        } else {
            bytes32 consensusHash = IPolygonPessimisticConsensus(
                address(rollup.rollupContract)
            ).getConsensusHash();

            inputPessimisticBytes = abi.encodePacked(
                rollup.lastLocalExitRoot,
                rollup.lastPessimisticRoot,
                l1InfoTreeRoot,
                rollupID,
                consensusHash,
                newLocalExitRoot,
                newPessimisticRoot
            );
        }
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param rollupID Rollup id used to calculate the input snark bytes
     * @param initNumBatch Batch which the aggregator starts the verification
     * @param finalNewBatch Last batch aggregator intends to verify
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param oldStateRoot State root before batch is processed
     * @param newStateRoot New State root once the batch is processed
     */
    function getInputSnarkBytes(
        uint32 rollupID,
        uint64 initNumBatch,
        uint64 finalNewBatch,
        bytes32 newLocalExitRoot,
        bytes32 oldStateRoot,
        bytes32 newStateRoot
    ) public view returns (bytes memory) {
        return
            _getInputSnarkBytes(
                _rollupIDToRollupData[rollupID],
                initNumBatch,
                finalNewBatch,
                newLocalExitRoot,
                oldStateRoot,
                newStateRoot
            );
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param rollup Rollup data storage pointer
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
        // Sanity check
        bytes32 oldAccInputHash = rollup
            .sequencedBatches[initNumBatch]
            .accInputHash;

        bytes32 newAccInputHash = rollup
            .sequencedBatches[finalNewBatch]
            .accInputHash;

        // Sanity check
        if (initNumBatch != 0 && oldAccInputHash == bytes32(0)) {
            revert OldAccInputHashDoesNotExist();
        }

        if (newAccInputHash == bytes32(0)) {
            revert NewAccInputHashDoesNotExist();
        }

        // Check that new state root is inside goldilocks field
        if (!_checkStateRootInsidePrime(uint256(newStateRoot))) {
            revert NewStateRootNotInsidePrime();
        }

        return
            abi.encodePacked(
                msg.sender,
                oldStateRoot,
                oldAccInputHash,
                initNumBatch,
                rollup.chainID,
                rollup.forkID,
                newStateRoot,
                newAccInputHash,
                newLocalExitRoot,
                finalNewBatch
            );
    }

    /**
     * @notice Function to check if the state root is inside of the prime field
     * @param newStateRoot New State root once the batch is processed
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
     * @notice Get rollup state root given a batch number
     * @param rollupID Rollup identifier
     * @param batchNum Batch number
     */
    function getRollupBatchNumToStateRoot(
        uint32 rollupID,
        uint64 batchNum
    ) public view returns (bytes32) {
        return _rollupIDToRollupData[rollupID].batchNumToStateRoot[batchNum];
    }

    /**
     * @notice Get rollup sequence batches struct given a batch number
     * @param rollupID Rollup identifier
     * @param batchNum Batch number
     */
    function getRollupSequencedBatches(
        uint32 rollupID,
        uint64 batchNum
    ) public view returns (SequencedBatchData memory) {
        return _rollupIDToRollupData[rollupID].sequencedBatches[batchNum];
    }

    /**
     * @notice Get rollup data: VerifierType StateTransition
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupData(
        uint32 rollupID
    ) public view returns (RollupDataReturn memory rollupData) {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupData.rollupContract = rollup.rollupContract;
        rollupData.chainID = rollup.chainID;
        rollupData.verifier = rollup.verifier;
        rollupData.forkID = rollup.forkID;
        rollupData.lastLocalExitRoot = rollup.lastLocalExitRoot;
        rollupData.lastBatchSequenced = rollup.lastBatchSequenced;
        rollupData.lastVerifiedBatch = rollup.lastVerifiedBatch;
        rollupData._legacyLastPendingState = rollup._legacyLastPendingState;
        rollupData._legacyLastPendingStateConsolidated = rollup
            ._legacyLastPendingStateConsolidated;
        rollupData.lastVerifiedBatchBeforeUpgrade = rollup
            .lastVerifiedBatchBeforeUpgrade;
        rollupData.rollupTypeID = rollup.rollupTypeID;
        rollupData.rollupVerifierType = rollup.rollupVerifierType;
    }

    /**
     * @notice Get rollup data: VerifierType State transition
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataDeserialized(
        uint32 rollupID
    )
        public
        view
        returns (
            address rollupContract,
            uint64 chainID,
            address verifier,
            uint64 forkID,
            bytes32 lastLocalExitRoot,
            uint64 lastBatchSequenced,
            uint64 lastVerifiedBatch,
            uint64 legacyLastPendingState,
            uint64 legacyLastPendingStateConsolidated,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID,
            VerifierType rollupVerifierType
        )
    {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupContract = rollup.rollupContract;
        chainID = rollup.chainID;
        verifier = rollup.verifier;
        forkID = rollup.forkID;
        lastLocalExitRoot = rollup.lastLocalExitRoot;
        lastBatchSequenced = rollup.lastBatchSequenced;
        lastVerifiedBatch = rollup.lastVerifiedBatch;
        legacyLastPendingState = rollup._legacyLastPendingState;
        legacyLastPendingStateConsolidated = rollup
            ._legacyLastPendingStateConsolidated;
        lastVerifiedBatchBeforeUpgrade = rollup.lastVerifiedBatchBeforeUpgrade;
        rollupTypeID = rollup.rollupTypeID;
        rollupVerifierType = rollup.rollupVerifierType;
    }

    /**
     * @notice Get rollup data: VerifierType Pessimistic
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataV2(
        uint32 rollupID
    ) public view returns (RollupDataReturnV2 memory rollupData) {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupData.rollupContract = rollup.rollupContract;
        rollupData.chainID = rollup.chainID;
        rollupData.verifier = rollup.verifier;
        rollupData.forkID = rollup.forkID;
        rollupData.lastLocalExitRoot = rollup.lastLocalExitRoot;
        rollupData.lastBatchSequenced = rollup.lastBatchSequenced;
        rollupData.lastVerifiedBatch = rollup.lastVerifiedBatch;
        rollupData.lastVerifiedBatchBeforeUpgrade = rollup
            .lastVerifiedBatchBeforeUpgrade;
        rollupData.rollupTypeID = rollup.rollupTypeID;
        rollupData.rollupVerifierType = rollup.rollupVerifierType;
        rollupData.lastPessimisticRoot = rollup.lastPessimisticRoot;
        rollupData.programVKey = rollup.programVKey;
    }

    /**
     * @notice Get rollup data deserialized
     * @dev A deserialized version of the rollup data done for a better parsing from etherscan
     * @param rollupID Rollup identifier
     */
    function rollupIDToRollupDataV2Deserialized(
        uint32 rollupID
    )
        public
        view
        returns (
            address rollupContract,
            uint64 chainID,
            address verifier,
            uint64 forkID,
            bytes32 lastLocalExitRoot,
            uint64 lastBatchSequenced,
            uint64 lastVerifiedBatch,
            uint64 lastVerifiedBatchBeforeUpgrade,
            uint64 rollupTypeID,
            VerifierType rollupVerifierType,
            bytes32 lastPessimisticRoot,
            bytes32 programVKey
        )
    {
        RollupData storage rollup = _rollupIDToRollupData[rollupID];

        rollupContract = rollup.rollupContract;
        chainID = rollup.chainID;
        verifier = rollup.verifier;
        forkID = rollup.forkID;
        lastLocalExitRoot = rollup.lastLocalExitRoot;
        lastBatchSequenced = rollup.lastBatchSequenced;
        lastVerifiedBatch = rollup.lastVerifiedBatch;
        lastVerifiedBatchBeforeUpgrade = rollup.lastVerifiedBatchBeforeUpgrade;
        rollupTypeID = rollup.rollupTypeID;
        rollupVerifierType = rollup.rollupVerifierType;
        lastPessimisticRoot = rollup.lastPessimisticRoot;
        programVKey = rollup.programVKey;
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return ROLLUP_MANAGER_VERSION;
    }
}
