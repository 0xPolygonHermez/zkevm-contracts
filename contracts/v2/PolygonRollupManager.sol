// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "./interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "../interfaces/IPolygonZkEVMBridge.sol";
import "./interfaces/IPolygonRollupBase.sol";
import "../interfaces/IVerifierRollup.sol";
import "../lib/EmergencyManager.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./lib/PolygonTransparentProxy.sol";
import "./lib/PolygonAccessControlUpgradeable.sol";
import "./lib/LegacyZKEVMStateVariables.sol";
import "./consensus/zkEVM/PolygonZkEVMExistentEtrog.sol";
import "./lib/PolygonConstantsBase.sol";
import "./interfaces/IPolygonPessimisticConsensus.sol";
import "./interfaces/ISP1Verifier.sol";
import "./interfaces/IPolygonRollupManager.sol";

/**
 * Contract responsible for managing rollups and the verification of their batches.
 * This contract will create and update rollups and store all the hashed sequenced data from them.
 * The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
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

    enum VerifierType {
        StateTransition,
        Pessimistic
    }

    /**
     * @notice Struct which to store the rollup type data
     * @param consensusImplementation Consensus implementation ( contains the consensus logic for the transaparent proxy)
     * @param address verifier
     * @param forkID fork ID
     * @param rollupVerifierType Rollup compatibility ID, to check upgradability between rollup types
     * @param obsolete Indicates if the rollup type is obsolete
     * @param genesis Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them
     */
    struct RollupType {
        address consensusImplementation;
        address verifier;
        uint64 forkID;
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
     */
    struct RollupData {
        IPolygonRollupBase rollupContract;
        uint64 chainID;
        address verifier;
        uint64 forkID;
        mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
        mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
        mapping(uint256 pendingStateNum => PendingState) _legacyPendingStateTransitions;
        bytes32 lastLocalExitRoot;
        uint64 lastBatchSequenced;
        uint64 lastVerifiedBatch;
        uint64 _legacyLastPendingState;
        uint64 _legacyLastPendingStateConsolidated;
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

    // Rollups ID mapping
    mapping(uint32 rollupID => RollupData) public rollupIDToRollupData;

    // Rollups address mapping
    // Pessimistic rollups does not have setted this mapping
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
    uint64 public __legacyTrustedAggregatorTimeout;

    // Once a pending state exceeds this timeout it can be consolidated (deprecated)
    uint64 internal __legacyPendingStateTimeout;

    // Time target of the verification of a batch
    // Adaptively the batchFee will be updated to achieve this target
    uint64 public __legacyVerifyBatchTimeTarget;

    // Batch fee multiplier with 3 decimals that goes from 1000 - 1023
    uint16 internal __legacyMultiplierBatchFee;

    // Current POL fee per batch sequenced
    // note This variable is internal, since the view function getBatchFee is likely to be upgraded
    uint256 internal _batchFee;

    // Timestamp when the last emergency state was deactivated
    uint64 public lastDeactivatedEmergencyStateTimestamp;

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
        VerifierType rollupVerifierType,
        uint64 lastVerifiedBatchBeforeUpgrade,
        bytes32 programVKey
    );

    /**
     * @dev Emitted when a rollup is udpated
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
     * @param programVKey Hashed program that will be executed in case of using a "general porpuse ZK verifier" e.g SP1
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
        uint32 rollupTypeID = ++rollupTypeCount;

        if (
            rollupVerifierType == VerifierType.Pessimistic &&
            (consensusImplementation != address(0) || genesis != bytes32(0))
        ) {
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

        // Increment rollup count
        uint32 rollupID = ++rollupCount;

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        // Load storage rollup data
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        // Store rollup data
        rollup.forkID = rollupType.forkID;
        rollup.verifier = rollupType.verifier;
        rollup.chainID = chainID;
        rollup.batchNumToStateRoot[0] = rollupType.genesis;
        rollup.rollupTypeID = rollupTypeID;
        rollup.rollupVerifierType = rollupType.rollupVerifierType;

        address rollupAddress;
        if (rollupType.rollupVerifierType == VerifierType.StateTransition) {
            // Create a new Rollup, using a transparent proxy pattern
            // Consensus will be the implementation, and this contract the admin
            rollupAddress = address(
                new PolygonTransparentProxy(
                    rollupType.consensusImplementation,
                    address(this),
                    new bytes(0)
                )
            );

            // Store rollup address mapping
            rollupAddressToID[rollupAddress] = rollupID;

            // Store rollup contract
            rollup.rollupContract = IPolygonRollupBase(rollupAddress);

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

        emit CreateNewRollup(
            rollupID,
            rollupTypeID,
            rollupAddress,
            chainID,
            gasTokenAddress
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
     * @param rollupVerifierType Compatibility ID for the added rollup
     */
    function addExistingRollup(
        IPolygonRollupBase rollupAddress,
        address verifier,
        uint64 forkID,
        uint64 chainID,
        bytes32 genesis,
        VerifierType rollupVerifierType,
        bytes32 programVKey,
        bytes32 newLocalExitRoot
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

        // Increment rollup count
        uint32 rollupID = ++rollupCount;

        if (rollupVerifierType == VerifierType.Pessimistic) {
            // No rollup address or genessis allowed for pessimistic rollups
            if (address(rollupAddress) != address(0) || genesis != bytes32(0)) {
                revert InvalidRollup();
            }
        } else {
            // Check if rollup address was already added
            if (rollupAddressToID[address(rollupAddress)] != 0) {
                revert RollupAddressAlreadyExist();
            }

            // Store rollup data
            rollupAddressToID[address(rollupAddress)] = rollupID;
        }

        // Set chainID nullifier
        chainIDToRollupID[chainID] = rollupID;

        RollupData storage rollup = rollupIDToRollupData[rollupID];
        rollup.rollupContract = rollupAddress;
        rollup.forkID = forkID;
        rollup.verifier = verifier;
        rollup.chainID = chainID;
        rollup.rollupVerifierType = rollupVerifierType;
        rollup.batchNumToStateRoot[0] = genesis;
        if (rollupVerifierType == VerifierType.Pessimistic) {
            rollup.programVKey = programVKey;
            rollup.lastLocalExitRoot = newLocalExitRoot;
        }
        // rollup type is 0, since it does not follow any rollup type
        emit AddExistingRollup(
            rollupID,
            forkID,
            address(rollupAddress),
            chainID,
            rollupVerifierType,
            0,
            programVKey
        );
    }

    /**
     * @notice Upgrade an existing rollup from the rollup admin address
     * This address is able to udpate the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE
     * This funciton only applies to state transition rollups
     * @param rollupContract Rollup consensus proxy address
     * @param newRollupTypeID New rolluptypeID to upgrade to
     */
    function updateRollupByRollupAdmin(
        ITransparentUpgradeableProxy rollupContract,
        uint32 newRollupTypeID
    ) external {
        // Check admin of the network is msg.sender
        if (IPolygonRollupBase(address(rollupContract)).admin() != msg.sender) {
            revert OnlyRollupAdmin();
        }

        // Check all sequences are verified before upgrading
        RollupData storage rollup = rollupIDToRollupData[
            rollupAddressToID[address(rollupContract)]
        ];

        // Check all sequenced batches are verified
        if (rollup.lastBatchSequenced != rollup.lastVerifiedBatch) {
            revert AllSequencedMustBeVerified();
        }

        // review sanity check
        if (rollup.rollupTypeID >= newRollupTypeID) {
            revert UpdateToOldRollupTypeID();
        }

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
     * @notice Upgrade an existing pessimistic srollup
     * @param rollupID Rollup consensus proxy address
     * @param newRollupTypeID New rolluptypeID to upgrade to
     * @param upgradeData Upgrade data
     */
    function updatePessimisticRollup(
        uint32 rollupID,
        uint32 newRollupTypeID,
        bytes memory upgradeData
    ) external onlyRole(_UPDATE_ROLLUP_ROLE) {
        // Check that rollup type exists
        if (newRollupTypeID == 0 || newRollupTypeID > rollupTypeCount) {
            revert RollupTypeDoesNotExist();
        }

        // Check the rollup exists
        if (rollupID == 0) {
            revert RollupMustExist();
        }

        RollupData storage rollup = rollupIDToRollupData[rollupID];

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
        // TODO allow converison between rollups
        if (rollup.rollupVerifierType != newRollupType.rollupVerifierType) {
            revert UpdateNotCompatible();
        }

        // Update rollup parameters
        rollup.verifier = newRollupType.verifier;
        rollup.forkID = newRollupType.forkID;
        rollup.rollupTypeID = newRollupTypeID;

        emit UpdateRollup(rollupID, newRollupTypeID, 0);
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

        RollupData storage rollup = rollupIDToRollupData[rollupID];

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
        // TODO allow conversion between rollups
        if (rollup.rollupVerifierType != newRollupType.rollupVerifierType) {
            revert UpdateNotCompatible();
        }

        // Update rollup parameters
        rollup.verifier = newRollupType.verifier;
        rollup.forkID = newRollupType.forkID;
        rollup.programVKey = newRollupType.programVKey;
        rollup.rollupTypeID = newRollupTypeID;

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
     * @notice Rollback batches of the target rollup
     * Only applies to state transition rollups
     * @param rollupContract Rollup consensus proxy address
     * @param targetBatch Batch to rollback up to but not including this batch
     */
    function rollbackBatches(
        IPolygonRollupBase rollupContract,
        uint64 targetBatch
    ) external {
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
        RollupData storage rollup = rollupIDToRollupData[rollupID];
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

        // This prevents overwritting sequencedBatches
        if (newSequencedBatches == 0) {
            revert MustSequenceSomeBatch();
        }

        RollupData storage rollup = rollupIDToRollupData[rollupID];

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
        // It's still there just to have backwards compatibility
        if (pendingStateNum != 0) {
            revert PendingStateNumExist();
        }

        RollupData storage rollup = rollupIDToRollupData[rollupID];

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
     * @notice Allows a trusted aggregator to verify multiple batches
     * @param rollupID Rollup identifier
     * @param selectedGlobalExitRoot Selected global exit root to proof imported bridges
     * @param bridgeInfoHash Hashed information regarding the new bridges on the network
     * the imported bridges of other networks and the authentication for this pessimistic proof (e.g signature)
     * @param newLocalExitRoot New local exit root once the batch is processed
     * @param newPessimisticRoot New pessimistic information,
     * currently contains the local balance tree, the local nullifier tree hashed and some auth pubkey
     * @param proof Fflonk proof
     */
    function verifyPessimisticTrustedAggregator(
        uint32 rollupID,
        bytes32 selectedGlobalExitRoot,
        bytes32 bridgeInfoHash,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes32[24] calldata proof
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        if (rollup.rollupVerifierType != VerifierType.Pessimistic) {
            revert OnlyPessimisticChains();
        }

        if (
            globalExitRootManager.globalExitRootMap(selectedGlobalExitRoot) == 0
        ) {
            revert GlobalExitRootNotExist();
        }

        // Get snark bytes
        bytes32 snarkHashBytes = sha256(
            abi.encodePacked(
                rollup.lastLocalExitRoot,
                rollup.lastPessimisticRoot,
                bridgeInfoHash,
                newLocalExitRoot,
                newPessimisticRoot
            )
        );

        // Calulate the snark input // TODO assume same proof input for now..
        uint256 inputSnark = uint256(snarkHashBytes) % _RFIELD;

        // Verify proof
        if (!rollup.verifier.verifyProof(proof, [inputSnark])) {
            revert InvalidProof();
        }

        // TODO Since there are no batches we could have either:
        // A pool of POL for pessimistic, or make the fee system offchain, since there are already a
        // dependency with the trusted aggregator ( or pessimistic aggregator)

        // Update aggregation parameters
        lastAggregationTimestamp = uint64(block.timestamp);

        // Consolidate state
        rollup.lastLocalExitRoot = newLocalExitRoot;
        rollup.lastPessimisticRoot = newPessimisticRoot;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        emit VerifyBatchesTrustedAggregator(
            rollupID,
            0, // final batch, does not apply in pessimistic
            bytes32(0), // new state root, does not apply in pessimistic
            newLocalExitRoot,
            msg.sender
        );
    }

    /**
     * @notice Allows a trusted aggregator to verify pessimistic proof
     * @param rollupID Rollup identifier
     * @param selectedGlobalExitRoot Selected global exit root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     * @param proof SP1 proof (Plonk)
     */
    function verifyPessimisticTrustedAggregator(
        uint32 rollupID,
        bytes32 selectedGlobalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot,
        bytes calldata proof
    ) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) {
        RollupData storage rollup = rollupIDToRollupData[rollupID];

        // Only for pessimistic verifiers
        if (rollup.rollupVerifierType != VerifierType.Pessimistic) {
            revert OnlyChainsWithPessimisticProofs();
        }

        // Check selected global exit root exist
        if (
            globalExitRootManager.globalExitRootMap(selectedGlobalExitRoot) == 0
        ) {
            revert GlobalExitRootNotExist();
        }

        bytes memory inputPessimisticBytes = _getInputPessimisticBytes(
            rollup,
            selectedGlobalExitRoot,
            newLocalExitRoot,
            newPessimisticRoot
        );

        // Verify proof
        ISP1Verifier(rollup.verifier).verifyProof(
            rollup.programVKey,
            inputPessimisticBytes,
            proof
        );

        // TODO: Since there are no batches we could have either:
        // A pool of POL for pessimistic, or make the fee system offchain, since there are already a
        // dependency with the trusted aggregator ( or pessimistic aggregator)

        // Update aggregation parameters
        lastAggregationTimestamp = uint64(block.timestamp);

        // Consolidate state
        rollup.lastLocalExitRoot = newLocalExitRoot;
        rollup.lastPessimisticRoot = newPessimisticRoot;

        // Interact with globalExitRootManager
        globalExitRootManager.updateExitRoot(getRollupExitRoot());

        // Same event as verifyBatches to support current bridge service to synchronize everything
        emit VerifyBatchesTrustedAggregator(
            rollupID,
            0, // final batch: does not apply in pessimistic
            bytes32(0), // new state root: does not apply in pessimistic
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

        // Calulate the snark input
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
        rollup.rollupContract.onVerifyBatches(
            finalNewBatch,
            newStateRoot,
            msg.sender
        );
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
     * @notice Get the last verified batch
     */
    function getLastVerifiedBatch(
        uint32 rollupID
    ) public view returns (uint64) {
        return _getLastVerifiedBatch(rollupIDToRollupData[rollupID]);
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
     * This function is used instad of the automatic public view one,
     * because in a future might change the behaviour and we will be able to mantain the interface
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
     * @param selectedGlobalExitRoot Selected global exit root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     */
    function getInputPessimisticBytes(
        uint32 rollupID,
        bytes32 selectedGlobalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot
    ) public view returns (bytes memory) {
        return
            _getInputPessimisticBytes(
                rollupIDToRollupData[rollupID],
                selectedGlobalExitRoot,
                newLocalExitRoot,
                newPessimisticRoot
            );
    }

    /**
     * @notice Function to calculate the input snark bytes
     * @param rollup Rollup data storage pointer
     * @param selectedGlobalExitRoot Selected global exit root to proof imported bridges
     * @param newLocalExitRoot New local exit root
     * @param newPessimisticRoot New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
     */
    function _getInputPessimisticBytes(
        RollupData storage rollup,
        bytes32 selectedGlobalExitRoot,
        bytes32 newLocalExitRoot,
        bytes32 newPessimisticRoot
    ) internal view returns (bytes memory) {
        // Get consensus information from the consensus contract
        bytes32 consensusHash = IPolygonPessimisticConsensus(
            address(rollup.rollupContract)
        ).getConsensusHash();

        return
            abi.encodePacked(
                rollup.lastLocalExitRoot,
                rollup.lastPessimisticRoot,
                selectedGlobalExitRoot,
                consensusHash,
                newLocalExitRoot,
                newPessimisticRoot
            );
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
        return rollupIDToRollupData[rollupID].batchNumToStateRoot[batchNum];
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
        return rollupIDToRollupData[rollupID].sequencedBatches[batchNum];
    }
}
