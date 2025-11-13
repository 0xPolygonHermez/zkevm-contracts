// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";

/// @custom:implementation
/// @title AggchainFEP
/// @notice Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol
/// @dev this contract aims to be the implementation of a FEP chain that is attached to the aggLayer
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

    // Aggchain type selector, hardcoded value used to force the first 2 byes of aggchain selector to retrieve the aggchain verification key
    bytes2 public constant AGGCHAIN_TYPE = 0x0001;

    /// @notice Op L2OO Semantic version.
    /// @custom:semver v2.0.0
    string public constant version = "v2.0.0";

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
    /// this verification is the output of converting the [u32; 8] range BabyBear verification key to a [u8; 32] array.
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
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
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

    /// @notice Initialize function for the contract.
    /// @custom:security First initialization takes into account this contracts and all the inheritance contracts
    ///                  Second initialization does not initialize PolygonConsensusBase parameters
    ///                  Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus
    /// @param initializeBytesAggchain Encoded bytes to initialize the aggchain
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        // initialize all parameters
        if (_initializerVersion == 0) {
            // Decode the struct
            (
                // chain custom params
                InitParams memory _initParams,
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
                address _vKeyManager,
                // PolygonConsensusBase params
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName
            ) = abi.decode(
                    initializeBytesAggchain,
                    (
                        InitParams,
                        bool,
                        bytes32,
                        bytes4,
                        address,
                        address,
                        address,
                        address,
                        string,
                        string
                    )
                );

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // init FEP params
            _initializeAggchain(_initParams);

            // Set aggchainBase variables
            _initializeAggchainBaseAndConsensusBase(
                _admin,
                _trustedSequencer,
                _gasTokenAddress,
                _trustedSequencerURL,
                _networkName,
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager
            );
        } else if (_initializerVersion == 1) {
            // contract has been previously initialized with all parameters in the PolygonConsensusBase.sol
            // Only initialize the FEP and AggchainBase params
            (
                // chain custom params
                InitParams memory _initParams,
                // aggchainBase params
                bool _useDefaultGateway,
                bytes32 _initOwnedAggchainVKey,
                bytes4 _initAggchainVKeySelector,
                address _vKeyManager
            ) = abi.decode(
                    initializeBytesAggchain,
                    (InitParams, bool, bytes32, bytes4, address)
                );

            // Check the aggchainType embedded the _initAggchainVKeySelector is valid
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                AGGCHAIN_TYPE
            ) {
                revert InvalidAggchainType();
            }

            // init FEP params
            _initializeAggchain(_initParams);

            // Set aggchainBase variables
            _initializeAggchainBase(
                _useDefaultGateway,
                _initOwnedAggchainVKey,
                _initAggchainVKeySelector,
                _vKeyManager
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
    }

    /// @notice Initializer AggchainFEP storage
    /// @param _initParams The initialization parameters for the contract.
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

        rollupConfigHash = _initParams.rollupConfigHash;
        optimisticModeManager = _initParams.optimisticModeManager;

        aggregationVkey = _initParams.aggregationVkey;
        rangeVkeyCommitment = _initParams.rangeVkeyCommitment;
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////

    /// @notice Callback while pessimistic proof is being verified from the rollup manager
    /// @notice Returns the aggchain hash for a given aggchain data
    ///
    ///     aggchain_hash:
    ///     Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  |
    ///     length (bits):   | 32             | 256            | 256              |
    ///
    ///     aggchain_params:
    ///     Field:           | l2PreRoot         | claimRoot          | claimBlockNum      | rollupConfigHash     | optimisticMode  | trustedSequencer | rangeVkeyCommitment | aggregationVkey |
    ///     length (bits):   | 256               | 256                | 256                | 256                  | 8               | 160              | 256                 | 256             |
    ///
    /// @param aggchainData custom bytes provided by the chain
    ///     aggchainData:
    ///     Field:           | _aggchainVKeySelector | _outputRoot  | _l2BlockNumber |
    ///     length (bits):   | 32                    | 256          | 256            |
    ///
    /// aggchainData._aggchainVKeySelector First 4 bytes of the aggchain vkey selector
    /// aggchainData._outputRoot Proposed new output root
    /// aggchainData._l2BlockNumber Proposed new l2 bock number
    ///
    /// @return aggchainHash resulting aggchain hash
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        if (aggchainData.length != 32 * 3) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (
            bytes4 _aggchainVKeySelector,
            bytes32 _outputRoot,
            uint256 _l2BlockNumber
        ) = abi.decode(aggchainData, (bytes4, bytes32, uint256));

        // Check the aggchainType embedded the _aggchainVKeySelector is valid
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

        bytes32 aggchainParams = keccak256(
            abi.encodePacked(
                l2Outputs[latestOutputIndex()].outputRoot,
                _outputRoot,
                _l2BlockNumber,
                rollupConfigHash,
                optimisticMode,
                trustedSequencer,
                rangeVkeyCommitment,
                aggregationVkey
            )
        );

        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    getAggchainVKey(_aggchainVKeySelector),
                    aggchainParams
                )
            );
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

    /// @notice Callback when pessimistic proof is verified, can only be called by the rollup manager
    ///         Stores the necessary chain data when the pessimistic proof is verified
    /// @param aggchainData Custom data provided by the chain
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

    ////////////////////////////////////////////////////////
    //                aggchainManager functions           //
    ////////////////////////////////////////////////////////

    /// @notice Update the submission interval.
    /// @param _submissionInterval The new submission interval.
    function updateSubmissionInterval(
        uint256 _submissionInterval
    ) external onlyAggchainManager {
        if (_submissionInterval == 0) {
            revert SubmissionIntervalMustBeGreaterThanZero();
        }

        emit SubmissionIntervalUpdated(submissionInterval, _submissionInterval);
        submissionInterval = _submissionInterval;
    }

    /// @notice Updates the aggregation verification key.
    /// @param _aggregationVkey The new aggregation verification key.
    function updateAggregationVkey(
        bytes32 _aggregationVkey
    ) external onlyAggchainManager {
        if (_aggregationVkey == bytes32(0)) {
            revert AggregationVkeyMustBeDifferentThanZero();
        }

        emit AggregationVkeyUpdated(aggregationVkey, _aggregationVkey);
        aggregationVkey = _aggregationVkey;
    }

    /// @notice Updates the range verification key commitment.
    /// @param _rangeVkeyCommitment The new range verification key commitment.
    function updateRangeVkeyCommitment(
        bytes32 _rangeVkeyCommitment
    ) external onlyAggchainManager {
        if (_rangeVkeyCommitment == bytes32(0)) {
            revert RangeVkeyCommitmentMustBeDifferentThanZero();
        }

        emit RangeVkeyCommitmentUpdated(
            rangeVkeyCommitment,
            _rangeVkeyCommitment
        );
        rangeVkeyCommitment = _rangeVkeyCommitment;
    }

    /// @notice Updates the rollup config hash.
    /// @param _rollupConfigHash The new rollup config hash.
    function updateRollupConfigHash(
        bytes32 _rollupConfigHash
    ) external onlyAggchainManager {
        if (_rollupConfigHash == bytes32(0)) {
            revert RollupConfigHashMustBeDifferentThanZero();
        }

        emit RollupConfigHashUpdated(rollupConfigHash, _rollupConfigHash);
        rollupConfigHash = _rollupConfigHash;
    }

    /// @notice Enables optimistic mode.
    function enableOptimisticMode() external onlyOptimisticModeManager {
        if (optimisticMode) {
            revert OptimisticModeEnabled();
        }

        optimisticMode = true;
        emit EnableOptimisticMode();
    }

    /// @notice Disables optimistic mode.
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
    /// @notice Starts the optimisticModeManager role transfer
    /// This is a two step process, the pending optimisticModeManager must accepted to finalize the process
    /// @param newOptimisticModeManager Address of the new optimisticModeManager
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

    /// @notice Allow the current pending optimisticModeManager to accept the optimisticModeManager role
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
}
