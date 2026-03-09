// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";

/// @custom:implementation
/// @title AggchainFEP
/// @notice Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol
/// @dev This contract aims to be the implementation of a FEP chain that is attached to the aggLayer
///       contract is responsible for managing the states and the updates of a L2 network
contract AggchainFEP is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /// @notice Parameters to initialize the AggchainFEP contract.
    struct InitParams {
        uint256 l2BlockTime;
        bytes32 rollupConfigHash;
        bytes32 startingOutputRoot;
        uint256 startingBlockNumber;
        uint256 startingTimestamp;
        uint256 submissionInterval;
        address optimisticModeManager;
        bytes32 aggregationVkey;
        bytes32 rangeVkeyCommitment;
    }

    /// @notice OutputProposal represents a commitment to the L2 state. The timestamp is the L1
    ///         timestamp that the output root is posted.
    /// @custom:field outputRoot    Hash of the L2 output.
    /// @custom:field timestamp     Timestamp of the L1 block that the output root was submitted in.
    /// @custom:field l2BlockNumber L2 block number that the output corresponds to.
    struct OutputProposal {
        bytes32 outputRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    /// @notice Configuration parameters for OP Succinct verification.
    struct OpSuccinctConfig {
        /// @notice The verification key of the aggregation SP1 program.
        bytes32 aggregationVkey;
        /// @notice The 32 byte commitment to the BabyBear representation of the verification key of
        /// the range SP1 program. Specifically, this verification key is the output of converting
        /// the [u32; 8] range BabyBear verification key to a [u8; 32] array.
        bytes32 rangeVkeyCommitment;
        /// @notice The hash of the chain's rollup config, which ensures the proofs submitted are for
        /// the correct chain. This is used to prevent replay attacks.
        bytes32 rollupConfigHash;
    }

    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

    /// @notice Value to detect if the contract has been initialized previously.
    ///         This mechanism is used to migrate chains that have been already
    ///         initialized with a 'PolygonPessimisticConsensus' implementation
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////

    // Aggchain type selector, hardcoded value used to force the first 2 bytes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0x0001;

    /// @notice Op L2OO Semantic version.
    /// @custom:semver v3.0.0
    string public constant AGGCHAIN_FEP_VERSION = "v3.0.0";

    /// @notice The genesis configuration name.
    bytes32 public constant GENESIS_CONFIG_NAME =
        keccak256("opsuccinct_genesis");

    ////////////////////////////////////////////////////////////
    //                       Storage                          //
    ////////////////////////////////////////////////////////////

    /// @notice An array of L2 output proposals.
    /// @dev Same approach from https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol
    /// @dev This limits the ability to increase struct OutputProposal parameters in future upgrades
    /// @dev Not changed to a mapping style to maintain same storage slots as the original contract
    OutputProposal[] internal l2Outputs;

    /// @notice The number of the first L2 block recorded in this contract.
    uint256 public startingBlockNumber;

    /// @notice The timestamp of the first L2 block recorded in this contract.
    uint256 public startingTimestamp;

    /// @notice The minimum interval in L2 blocks at which checkpoints must be submitted.
    uint256 public submissionInterval;

    /// @notice The time between L2 blocks in seconds. Once set, this value MUST NOT be modified.
    uint256 public l2BlockTime;

    /// @notice The verification key of the aggregation SP1 program.
    bytes32 public aggregationVkey;

    /// @notice The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program. Specifically,
    /// this verification key is the output of converting the [u32; 8] range BabyBear verification key to a [u8; 32] array.
    bytes32 public rangeVkeyCommitment;

    /// @notice The hash of the chain's rollup configuration
    bytes32 public rollupConfigHash;

    /// @notice Activate optimistic mode. When true, the chain can bypass the state transition verification
    ///         and a trustedSequencer signature is needed to do a state transition.
    bool public optimisticMode;

    /// @notice Address that can trigger the optimistic mode
    ///         This mode should be used when the chain is in a state that is not possible to verify and it should be treated as an emergency mode
    address public optimisticModeManager;

    /// @notice This account will be able to accept the optimisticModeManager role
    address public pendingOptimisticModeManager;

    /// @notice Mapping of configuration names to OpSuccinctConfig structs.
    mapping(bytes32 => OpSuccinctConfig) public opSuccinctConfigs;

    /// @notice The name of the current OP Succinct configuration to use for the next submission.
    bytes32 public selectedOpSuccinctConfigName;

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////

    /// @notice Emitted when an FEP is verified.
    /// @param outputRoot    The output root.
    /// @param l2OutputIndex The index of the output in the l2Outputs array.
    /// @param l2BlockNumber The L2 block number of the output root.
    /// @param l1Timestamp   The L1 timestamp when proposed.
    event OutputProposed(
        bytes32 indexed outputRoot,
        uint256 indexed l2OutputIndex,
        uint256 indexed l2BlockNumber,
        uint256 l1Timestamp
    );

    /// @notice Emitted when the rollup config hash is updated.
    /// @param oldRollupConfigHash The old rollup config hash.
    /// @param newRollupConfigHash The new rollup config hash.
    event RollupConfigHashUpdated(
        bytes32 indexed oldRollupConfigHash,
        bytes32 indexed newRollupConfigHash
    );

    /// @notice Emitted when the submission interval is updated.
    /// @param oldSubmissionInterval The old submission interval.
    /// @param newSubmissionInterval The new submission interval.
    event SubmissionIntervalUpdated(
        uint256 oldSubmissionInterval,
        uint256 newSubmissionInterval
    );

    /// @notice Emitted when the optimistic mode is enabled.
    event EnableOptimisticMode();

    /// @notice Emitted when the optimistic mode is disabled.
    event DisableOptimisticMode();

    /// @dev Emitted when the optimisticModeManager starts the two-step transfer role setting a new pending optimisticModeManager
    /// @param currentOptimisticModeManager The current pending optimisticModeManager
    /// @param newPendingOptimisticModeManager The new pending optimisticModeManager
    event TransferOptimisticModeManagerRole(
        address currentOptimisticModeManager,
        address newPendingOptimisticModeManager
    );

    /// @notice Emitted when the pending optimisticModeManager accepts the optimisticModeManager role
    /// @param oldOptimisticModeManager The old optimisticModeManager
    /// @param newOptimisticModeManager The new optimisticModeManager
    event AcceptOptimisticModeManagerRole(
        address oldOptimisticModeManager,
        address newOptimisticModeManager
    );

    /// @notice Emitted when the aggregation verification key is updated.
    /// @param oldAggregationVkey The old aggregation verification key.
    /// @param newAggregationVkey The new aggregation verification key.
    event AggregationVkeyUpdated(
        bytes32 indexed oldAggregationVkey,
        bytes32 indexed newAggregationVkey
    );

    /// @notice Emitted when the range verification key commitment is updated.
    /// @param oldRangeVkeyCommitment The old range verification key commitment.
    /// @param newRangeVkeyCommitment The new range verification key commitment.
    event RangeVkeyCommitmentUpdated(
        bytes32 indexed oldRangeVkeyCommitment,
        bytes32 indexed newRangeVkeyCommitment
    );

    /// @notice Emitted when an OP Succinct configuration is updated.
    /// @param configName The name of the configuration.
    /// @param aggregationVkey The aggregation verification key.
    /// @param rangeVkeyCommitment The range verification key commitment.
    /// @param rollupConfigHash The rollup config hash.
    event OpSuccinctConfigUpdated(
        bytes32 indexed configName,
        bytes32 aggregationVkey,
        bytes32 rangeVkeyCommitment,
        bytes32 rollupConfigHash
    );

    /// @notice Emitted when an OP Succinct configuration is deleted.
    /// @param configName The name of the configuration that was deleted.
    event OpSuccinctConfigDeleted(bytes32 indexed configName);

    /// @notice Emitted when the current OP Succinct configuration is set for use.
    /// @param configName The name of the configuration that was set for use.
    event OpSuccinctConfigSelected(bytes32 indexed configName);

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////

    /// @notice optimistic mode is not enabled.
    error OptimisticModeNotEnabled();

    /// @notice optimistic mode is enabled.
    error OptimisticModeEnabled();

    /// @notice submission interval must be greater than 0.
    error SubmissionIntervalMustBeGreaterThanZero();

    /// @notice L2 block time must be greater than 0
    error L2BlockTimeMustBeGreaterThanZero();

    /// @notice starting L2 timestamp must be less than current time
    error StartL2TimestampMustBeLessThanCurrentTime();

    /// @notice rollup config hash must be different than 0
    error RollupConfigHashMustBeDifferentThanZero();

    /// @notice range vkey commitment must be different than 0
    error RangeVkeyCommitmentMustBeDifferentThanZero();

    /// @notice aggregation vkey must be different than 0
    error AggregationVkeyMustBeDifferentThanZero();

    /// @notice block number must be greater than or equal to next expected block number.
    error L2BlockNumberLessThanNextBlockNumber();

    /// @notice cannot propose L2 output in the future
    error CannotProposeFutureL2Output();

    /// @notice L2 output proposal cannot be the zero hash
    error L2OutputRootCannotBeZero();

    /// @notice Thrown when the caller is not the optimistic mode manager
    error OnlyOptimisticModeManager();

    /// @notice Thrown when the caller is not the pending optimistic mode manager
    error OnlyPendingOptimisticModeManager();

    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    /// @notice Thrown when the config does not exist
    error ConfigDoesNotExist();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        _initializerVersion = _getInitializedVersion();
        _;
    }

    /// @dev Only allows a function to be callable if the message sender is the optimistic mode manager
    modifier onlyOptimisticModeManager() {
        if (optimisticModeManager != msg.sender) {
            revert OnlyOptimisticModeManager();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////

    /// @notice Constructor AggchainFEP contract
    /// @param _globalExitRootManager Global exit root manager address
    /// @param _pol POL token address
    /// @param _bridgeAddress Bridge address
    /// @param _rollupManager Global exit root manager address
    /// @param _aggLayerGateway agglayer gateway address
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IAgglayerBridge _bridgeAddress,
        AgglayerManager _rollupManager,
        IAgglayerGateway _aggLayerGateway
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}

    ////////////////////////////////////////////////////////////
    //              Functions: initialization                 //
    ////////////////////////////////////////////////////////////

    /// @notice Initialize function for fresh deployment
    /// @custom:security Initializes all contracts including PolygonConsensusBase
    /// @param _initParams The initialization parameters for FEP
    /// @param _signersToAdd Array of signers to add to the multisig
    /// @param _newThreshold New threshold for multisig operations
    /// @param _useDefaultVkeys Whether to use default verification keys from gateway
    /// @param _useDefaultSigners Whether to use default signers from gateway
    /// @param _initOwnedAggchainVKey The owned aggchain verification key
    /// @param _initAggchainVKeySelector The aggchain verification key selector
    /// @param _admin The admin address
    /// @param _trustedSequencer The trusted sequencer address
    /// @param _gasTokenAddress The gas token address
    /// @param _trustedSequencerURL The trusted sequencer URL
    /// @param _networkName The network name
    function initialize(
        InitParams memory _initParams,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold,
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _admin,
        address _trustedSequencer,
        address _gasTokenAddress,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) external onlyAggchainManager getInitializedVersion reinitializer(3) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        // Check the use default vkeys is consistent
        _validateVKeysConsistency(
            _useDefaultVkeys,
            _initAggchainVKeySelector,
            _initOwnedAggchainVKey,
            AGGCHAIN_TYPE
        );

        // Set aggchainBase variables
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            _useDefaultVkeys,
            _useDefaultSigners,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );

        // init FEP params
        _initializeAggchain(_initParams);

        // Check the used default signers is consistent
        if (_useDefaultSigners) {
            if (_signersToAdd.length != 0 || threshold != 0) {
                revert ConflictingDefaultSignersConfiguration();
            }
        } else {
            // update signers and threshold
            _updateSignersAndThreshold(
                new RemoveSignerInfo[](0), // No signers to remove
                _signersToAdd,
                _newThreshold
            );
        }
    }

    /**
     * @notice Initialize function for upgrade from PolygonPessimisticConsensus or PolygonRollupBaseEtrog
     * @custom:security Only initializes FEP and AggchainBase params, not PolygonConsensusBase
     * @param _initParams The initialization parameters for FEP
     * @param _useDefaultVkeys Whether to use default verification keys from gateway
     * @param _useDefaultSigners Whether to use default signers from gateway
     * @param _initOwnedAggchainVKey The owned aggchain verification key
     * @param _initAggchainVKeySelector The aggchain verification key selector
     * @param _signersToAdd Array of signers to add to the multisig
     * @param _newThreshold New threshold for multisig operations
     */
    function initializeFromLegacyConsensus(
        InitParams memory _initParams,
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager getInitializedVersion reinitializer(3) {
        if (_initializerVersion != 1) {
            revert InvalidInitializer();
        }

        // Check the use default vkeys is consistent
        _validateVKeysConsistency(
            _useDefaultVkeys,
            _initAggchainVKeySelector,
            _initOwnedAggchainVKey,
            AGGCHAIN_TYPE
        );

        // init FEP params
        _initializeAggchain(_initParams);

        // Set aggchainBase variables
        _initializeAggchainBase(
            _useDefaultVkeys,
            _useDefaultSigners,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );

        // Check the used default signers is consistent
        if (_useDefaultSigners) {
            if (_signersToAdd.length != 0 || threshold != 0) {
                revert ConflictingDefaultSignersConfiguration();
            }
        } else {
            // update signers and threshold
            _updateSignersAndThreshold(
                new RemoveSignerInfo[](0), // No signers to remove
                _signersToAdd,
                _newThreshold
            );
        }
    }

    /**
     * @notice Initialize function for upgrade from AggchainECDSAMultisig to AggchainFEP
     * @custom:security Only initializes FEP specific parameters, assumes base and consensus are already initialized
     * @dev Used when transitioning from ECDSA multisig to FEP verification
     * @param _initParams The initialization parameters for FEP
     * @param _useDefaultVkeys Whether to use default verification keys from gateway
     * @param _initOwnedAggchainVKey The owned aggchain verification key
     * @param _initAggchainVKeySelector The aggchain verification key selector
     */
    function initializeFromECDSAMultisig(
        InitParams memory _initParams,
        bool _useDefaultVkeys,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector
    ) external onlyAggchainManager getInitializedVersion reinitializer(3) {
        // Check that the l2Outputs array is empty
        if (_initializerVersion != 2 || l2Outputs.length != 0) {
            revert InvalidInitializer();
        }

        // Check the use default vkeys is consistent
        _validateVKeysConsistency(
            _useDefaultVkeys,
            _initAggchainVKeySelector,
            _initOwnedAggchainVKey,
            AGGCHAIN_TYPE
        );

        // Set aggchainBase variables
        _initializeAggchainBase(
            _useDefaultVkeys,
            useDefaultSigners, // keep existing value
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );

        // init FEP params
        _initializeAggchain(_initParams);
    }

    /**
     * @notice Upgrade function from a previous FEP version
     * @custom:security Migrates existing FEP configuration to new format with genesis config and multisig
     * @dev Preserves existing configuration by moving it to genesis config slot
     */
    function upgradeFromPreviousFEP()
        external
        onlyRollupManager
        getInitializedVersion
        reinitializer(3)
    {
        // Check that the aggchainMultisigHash is not set
        if (_initializerVersion != 2 || aggchainMultisigHash != bytes32(0)) {
            revert InvalidInitializer();
        }

        // Add existing configuration to genesis for backward compatibility
        opSuccinctConfigs[GENESIS_CONFIG_NAME] = OpSuccinctConfig({
            aggregationVkey: aggregationVkey,
            rangeVkeyCommitment: rangeVkeyCommitment,
            rollupConfigHash: rollupConfigHash
        });
        selectedOpSuccinctConfigName = GENESIS_CONFIG_NAME;

        // emit OP succinct config events
        emit OpSuccinctConfigUpdated(
            GENESIS_CONFIG_NAME,
            aggregationVkey,
            rangeVkeyCommitment,
            rollupConfigHash
        );

        emit OpSuccinctConfigSelected(GENESIS_CONFIG_NAME);

        // set signer to trustedSequencer and threshold to 1
        // handle trustedSequencerURL as empty string
        if (bytes(trustedSequencerURL).length == 0) {
            _addSignerInternal(trustedSequencer, "NO_URL"); // cannot be empty string
        } else {
            _addSignerInternal(trustedSequencer, trustedSequencerURL);
        }
        threshold = 1;

        // update aggchainMultisigHash
        _updateAggchainMultisigHash();
    }

    /**
     * @notice Initializer AggchainFEP storage
     * @dev Internal function to set up FEP-specific parameters. Validates all parameters before setting.
     * @param _initParams The initialization parameters for the contract
     */
    function _initializeAggchain(InitParams memory _initParams) internal {
        if (_initParams.optimisticModeManager == address(0)) {
            revert InvalidZeroAddress();
        }

        if (_initParams.submissionInterval == 0) {
            revert SubmissionIntervalMustBeGreaterThanZero();
        }

        if (_initParams.l2BlockTime == 0) {
            revert L2BlockTimeMustBeGreaterThanZero();
        }

        if (_initParams.startingTimestamp > block.timestamp) {
            revert StartL2TimestampMustBeLessThanCurrentTime();
        }

        if (_initParams.rollupConfigHash == bytes32(0)) {
            revert RollupConfigHashMustBeDifferentThanZero();
        }

        submissionInterval = _initParams.submissionInterval;
        l2BlockTime = _initParams.l2BlockTime;

        // For proof verification to work, there must be an initial output.
        // Disregard the _startingBlockNumber and _startingTimestamp parameters during upgrades, as they're already set.
        if (l2Outputs.length == 0) {
            l2Outputs.push(
                OutputProposal({
                    outputRoot: _initParams.startingOutputRoot,
                    timestamp: uint128(_initParams.startingTimestamp),
                    l2BlockNumber: uint128(_initParams.startingBlockNumber)
                })
            );

            startingBlockNumber = _initParams.startingBlockNumber;
            startingTimestamp = _initParams.startingTimestamp;
        }

        optimisticModeManager = _initParams.optimisticModeManager;

        // Initialize genesis configuration
        opSuccinctConfigs[GENESIS_CONFIG_NAME] = OpSuccinctConfig({
            aggregationVkey: _initParams.aggregationVkey,
            rangeVkeyCommitment: _initParams.rangeVkeyCommitment,
            rollupConfigHash: _initParams.rollupConfigHash
        });

        selectedOpSuccinctConfigName = GENESIS_CONFIG_NAME;

        // emit OP succinct config events
        emit OpSuccinctConfigUpdated(
            GENESIS_CONFIG_NAME,
            _initParams.aggregationVkey,
            _initParams.rangeVkeyCommitment,
            _initParams.rollupConfigHash
        );
        emit OpSuccinctConfigSelected(GENESIS_CONFIG_NAME);
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////

    /// @dev Validates the provided aggchain data and returns the computed aggchain parameters and vkey
    ///
    ///     aggchain_params:
    ///     Field:           | l2PreRoot         | claimRoot          | claimBlockNum      | rollupConfigHash     | optimisticMode  | trustedSequencer | rangeVkeyCommitment | aggregationVkey |
    ///     length (bits):   | 256               | 256                | 256                | 256                  | 8               | 160              | 256                 | 256             |
    ///
    /// @param aggchainData custom bytes provided by the chain, encoded in ABI solidity format
    ///     aggchainData:
    ///     Field:                  | _aggchainVKeySelector | _outputRoot  | _l2BlockNumber |
    ///     length (bits):          | 32                    | 256          | 256            |
    ///     ABI encoding (bits):    | 256                   | 256          | 256            |
    ///
    /// aggchainData._aggchainVKeySelector First 4 bytes of the aggchain vkey selector
    /// aggchainData._outputRoot Proposed new output root
    /// aggchainData._l2BlockNumber Proposed new l2 block number
    ///
    /// @return aggchainVKey The aggchain verification key decoded from the input data
    /// @return aggchainParams The computed aggchain parameters hash
    /// @inheritdoc AggchainBase
    function getVKeyAndAggchainParams(
        bytes memory aggchainData
    ) public view override returns (bytes32, bytes32) {
        if (aggchainData.length != 32 * 3) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (
            bytes4 _aggchainVKeySelector,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber
        ) = abi.decode(aggchainData, (bytes4, bytes32, uint256));

        // Check the aggchainType embedded in the _aggchainVKeySelector is valid
        if (
            getAggchainTypeFromSelector(_aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        // check blockNumber
        if (_l2BlockNumber < nextBlockNumber()) {
            revert L2BlockNumberLessThanNextBlockNumber();
        }

        // check timestamp
        if (computeL2Timestamp(_l2BlockNumber) >= block.timestamp) {
            revert CannotProposeFutureL2Output();
        }

        // check non-zero stateRoot
        if (_outputRoot == bytes32(0)) {
            revert L2OutputRootCannotBeZero();
        }

        // Fetch config name
        OpSuccinctConfig memory config = opSuccinctConfigs[
            selectedOpSuccinctConfigName
        ];

        if (!isValidOpSuccinctConfig(config)) {
            revert ConfigDoesNotExist();
        }

        bytes32 aggchainParams = keccak256(
            abi.encodePacked(
                l2Outputs[latestOutputIndex()].outputRoot,
                _outputRoot,
                _l2BlockNumber,
                config.rollupConfigHash,
                optimisticMode,
                trustedSequencer,
                config.rangeVkeyCommitment,
                config.aggregationVkey
            )
        );

        return (getAggchainVKey(_aggchainVKeySelector), aggchainParams);
    }

    /// @notice Getter for the submissionInterval.
    ///         Public getter is legacy and will be removed in the future. Use `submissionInterval` instead.
    /// @return Submission interval.
    function SUBMISSION_INTERVAL() external view returns (uint256) {
        return submissionInterval;
    }

    /// @notice Getter for the l2BlockTime.
    ///         Public getter is legacy and will be removed in the future. Use `l2BlockTime` instead.
    /// @return L2 block time.
    function L2_BLOCK_TIME() external view returns (uint256) {
        return l2BlockTime;
    }

    /// @notice Returns an output by index. Needed to return a struct instead of a tuple.
    /// @param _l2OutputIndex Index of the output to return.
    /// @return l2Output The output at the given index.
    function getL2Output(
        uint256 _l2OutputIndex
    ) external view returns (OutputProposal memory) {
        return l2Outputs[_l2OutputIndex];
    }

    /// @notice Returns the number of outputs that have been proposed.
    ///         Will revert if no outputs have been proposed yet.
    /// @return latestOutputIndex The number of outputs that have been proposed.
    function latestOutputIndex() public view returns (uint256) {
        return l2Outputs.length - 1;
    }

    /// @notice Returns the index of the next output to be proposed.
    /// @return nextOutputIndex The index of the next output to be proposed.
    function nextOutputIndex() public view returns (uint256) {
        return l2Outputs.length;
    }

    /// @notice Returns the block number of the latest submitted L2 output proposal.
    ///         If no proposals been submitted yet then this function will return the starting
    ///         block number.
    /// @return latestBlockNumber Latest submitted L2 block number.
    function latestBlockNumber() public view returns (uint256) {
        return
            l2Outputs.length == 0
                ? startingBlockNumber
                : l2Outputs[l2Outputs.length - 1].l2BlockNumber;
    }

    /// @notice Computes the block number of the next L2 block that needs to be checkpointed.
    /// @return nextBlockNumber Next L2 block number.
    function nextBlockNumber() public view returns (uint256) {
        return latestBlockNumber() + submissionInterval;
    }

    /// @notice Returns the L2 timestamp corresponding to a given L2 block number.
    /// @param _l2BlockNumber The L2 block number of the target block.
    /// @return L2timestamp timestamp of the given block.
    function computeL2Timestamp(
        uint256 _l2BlockNumber
    ) public view returns (uint256) {
        return
            startingTimestamp +
            ((_l2BlockNumber - startingBlockNumber) * l2BlockTime);
    }

    ////////////////////////////////////////////////////////////
    //                       Functions                        //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Callback when pessimistic proof is verified, can only be called by the rollup manager
     * @dev Stores the necessary chain data when the pessimistic proof is verified
     * @param aggchainData Custom data provided by the chain containing outputRoot and l2BlockNumber
     */
    function onVerifyPessimistic(
        bytes memory aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 32 * 3) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (, bytes32 _outputRoot, uint256 _l2BlockNumber) = abi.decode(
            aggchainData,
            (bytes4, bytes32, uint256)
        );

        emit OutputProposed(
            _outputRoot,
            nextOutputIndex(),
            _l2BlockNumber,
            block.timestamp
        );

        l2Outputs.push(
            OutputProposal({
                outputRoot: _outputRoot,
                timestamp: uint128(block.timestamp),
                l2BlockNumber: uint128(_l2BlockNumber)
            })
        );
    }

    /// @notice Validates that an OpSuccinctConfig has all non-zero parameters.
    /// @param _config The OpSuccinctConfig to validate.
    /// @return True if all parameters are non-zero, false otherwise.
    function isValidOpSuccinctConfig(
        OpSuccinctConfig memory _config
    ) public pure returns (bool) {
        return
            _config.aggregationVkey != bytes32(0) &&
            _config.rangeVkeyCommitment != bytes32(0) &&
            _config.rollupConfigHash != bytes32(0);
    }

    ////////////////////////////////////////////////////////
    //                aggchainManager functions           //
    ////////////////////////////////////////////////////////

    /**
     * @notice Updates or creates an OP Succinct configuration
     * @dev Validates all parameters are non-zero before adding
     * @param _configName The name of the configuration
     * @param _rollupConfigHash The rollup config hash
     * @param _aggregationVkey The aggregation verification key
     * @param _rangeVkeyCommitment The range verification key commitment
     */
    function addOpSuccinctConfig(
        bytes32 _configName,
        bytes32 _rollupConfigHash,
        bytes32 _aggregationVkey,
        bytes32 _rangeVkeyCommitment
    ) external onlyAggchainManager {
        require(
            _configName != bytes32(0),
            "L2OutputOracle: config name cannot be empty"
        );
        require(
            !isValidOpSuccinctConfig(opSuccinctConfigs[_configName]),
            "L2OutputOracle: config already exists"
        );

        OpSuccinctConfig memory newConfig = OpSuccinctConfig({
            aggregationVkey: _aggregationVkey,
            rangeVkeyCommitment: _rangeVkeyCommitment,
            rollupConfigHash: _rollupConfigHash
        });

        require(
            isValidOpSuccinctConfig(newConfig),
            "L2OutputOracle: invalid OP Succinct configuration parameters"
        );

        opSuccinctConfigs[_configName] = newConfig;

        emit OpSuccinctConfigUpdated(
            _configName,
            _aggregationVkey,
            _rangeVkeyCommitment,
            _rollupConfigHash
        );
    }

    /**
     * @notice Deletes an OP Succinct configuration
     * @param _configName The name of the configuration to delete
     */
    function deleteOpSuccinctConfig(
        bytes32 _configName
    ) external onlyAggchainManager {
        delete opSuccinctConfigs[_configName];
        emit OpSuccinctConfigDeleted(_configName);
    }

    /**
     * @notice Sets the OP Succinct configuration to use for the next submission
     * @dev Validates the configuration exists before setting it as selected
     * @param _configName The name of the configuration to use
     */
    function selectOpSuccinctConfig(
        bytes32 _configName
    ) external onlyAggchainManager {
        if (!isValidOpSuccinctConfig(opSuccinctConfigs[_configName])) {
            revert ConfigDoesNotExist();
        }

        selectedOpSuccinctConfigName = _configName;
        emit OpSuccinctConfigSelected(_configName);
    }

    /**
     * @notice Update the submission interval
     * @dev Must be greater than zero
     * @param _submissionInterval The new submission interval in L2 blocks
     */
    function updateSubmissionInterval(
        uint256 _submissionInterval
    ) external onlyAggchainManager {
        if (_submissionInterval == 0) {
            revert SubmissionIntervalMustBeGreaterThanZero();
        }

        emit SubmissionIntervalUpdated(submissionInterval, _submissionInterval);
        submissionInterval = _submissionInterval;
    }

    /**
     * @notice Enables optimistic mode
     * @dev When enabled, the chain can bypass state transition verification
     */
    function enableOptimisticMode() external onlyOptimisticModeManager {
        if (optimisticMode) {
            revert OptimisticModeEnabled();
        }

        optimisticMode = true;
        emit EnableOptimisticMode();
    }

    /**
     * @notice Disables optimistic mode
     * @dev Returns to normal verification mode
     */
    function disableOptimisticMode() external onlyOptimisticModeManager {
        if (!optimisticMode) {
            revert OptimisticModeNotEnabled();
        }

        optimisticMode = false;
        emit DisableOptimisticMode();
    }

    ////////////////////////////////////////////////////////////
    //         optimisticModeManager functions                //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Starts the optimisticModeManager role transfer
     * @dev This is a two step process, the pending optimisticModeManager must accept to finalize the process
     * @param newOptimisticModeManager Address of the new optimisticModeManager
     */
    function transferOptimisticModeManagerRole(
        address newOptimisticModeManager
    ) external onlyOptimisticModeManager {
        if (newOptimisticModeManager == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingOptimisticModeManager = newOptimisticModeManager;

        emit TransferOptimisticModeManagerRole(
            optimisticModeManager,
            newOptimisticModeManager
        );
    }

    /**
     * @notice Allow the current pending optimisticModeManager to accept the optimisticModeManager role
     * @dev Can only be called by the pending optimisticModeManager
     */
    function acceptOptimisticModeManagerRole() external {
        if (pendingOptimisticModeManager != msg.sender) {
            revert OnlyPendingOptimisticModeManager();
        }

        address oldOptimisticModeManager = optimisticModeManager;
        optimisticModeManager = pendingOptimisticModeManager;
        delete pendingOptimisticModeManager;

        emit AcceptOptimisticModeManagerRole(
            oldOptimisticModeManager,
            optimisticModeManager
        );
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return AGGCHAIN_FEP_VERSION;
    }
}
