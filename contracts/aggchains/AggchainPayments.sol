// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// imports aggLayer
import "../lib/AggchainBase.sol";

/// @custom:implementation
/// @title AggchainPayments
/// @notice Trimmed aggchain implementation for the Agglayer Payments v2 chain.
/// @dev Forked from `AggchainFEP.sol` (v1 spec §7.4). It keeps the FEP getter ABI
///      subset consumed by the aggsender (`startingBlockNumber`, `latestBlockNumber`,
///      `optimisticMode`, `getAggchainSigners`, `getThreshold`, and the inherited
///      `getAggchainVKey`/`getAggchainHash`) and the owned-vkey + multisig plumbing
///      from `AggchainBase`, but drops all op-succinct config / dispute-game / oracle
///      machinery. State transitions commit a single `(newStateRoot, endBlock)` pair.
contract AggchainPayments is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

    /// @notice Value to detect if the contract has been initialized previously.
    uint8 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////

    /// @notice Aggchain type selector, hardcoded value used to force the last 2
    ///         bytes of the aggchain selector when retrieving the aggchain vkey.
    bytes2 public constant AGGCHAIN_TYPE = 0x0001;

    /// @notice Aggchain version.
    string public constant AGGCHAIN_PAYMENTS_VERSION = "v1.0.0";

    /// @notice Optimistic mode is not supported by the Payments aggchain.
    /// @dev Kept as a constant getter so the aggsender's `optimisticMode()` ABI
    ///      call is preserved and always resolves to false.
    bool public constant optimisticMode = false;

    ////////////////////////////////////////////////////////////
    //                       Storage                          //
    ////////////////////////////////////////////////////////////

    /// @notice The number of the first L2 block recorded in this contract.
    uint256 public startingBlockNumber;

    /// @notice The L2 block number of the latest verified state transition.
    ///         Before any verification it equals `startingBlockNumber`.
    uint256 public latestBlockNumber;

    /// @notice The latest verified state root. Used as `lastStateRoot` when
    ///         composing the aggchain params. Set at initialization to the
    ///         starting state root.
    bytes32 public lastStateRoot;

    ////////////////////////////////////////////////////////////
    //                         Events                         //
    ////////////////////////////////////////////////////////////

    /// @notice Emitted when a pessimistic proof is verified and a new state
    ///         transition is committed.
    /// @param newStateRoot The newly committed state root.
    /// @param endBlock     The L2 block number the new state root corresponds to.
    event PaymentsStateUpdated(
        bytes32 indexed newStateRoot,
        uint256 indexed endBlock
    );

    ////////////////////////////////////////////////////////////
    //                         Errors                         //
    ////////////////////////////////////////////////////////////

    /// @notice Thrown when trying to initialize the wrong initialize function.
    error InvalidInitializer();

    /// @notice new state root proposal cannot be the zero hash.
    error StateRootCannotBeZero();

    /// @notice end block must be strictly greater than the latest block number.
    error EndBlockNotGreaterThanLatest();

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    /// @dev Modifier to retrieve initializer version value previous to using the
    ///      reinitializer modifier, it's used in the initialize function.
    modifier getInitializedVersion() {
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////

    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token contract address.
     * @param _bridgeAddress Bridge contract address.
     * @param _rollupManager Rollup manager contract address.
     * @param _aggLayerGateway AgglayerGateway contract address.
     */
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

    /**
     * @notice Initialize function for a fresh deployment.
     * @dev Owned-vkey plumbing only: `useDefaultVkeys` and `useDefaultSigners`
     *      are hardcoded to false, so the aggchain manages its own vkey (via the
     *      `_initAggchainVKeySelector`/`_initOwnedAggchainVKey` pair) and its own
     *      multisig (`_signersToAdd`/`_newThreshold`).
     * @param _startingBlockNumber The number of the first L2 block recorded.
     * @param _startingStateRoot The initial (genesis) state root.
     * @param _signersToAdd Array of signers to add to the multisig.
     * @param _newThreshold Threshold for multisig operations.
     * @param _initOwnedAggchainVKey The owned aggchain verification key.
     * @param _initAggchainVKeySelector The aggchain verification key selector.
     * @param _admin The admin address.
     * @param _trustedSequencer The trusted sequencer address.
     * @param _gasTokenAddress The gas token address.
     * @param _trustedSequencerURL The trusted sequencer URL.
     * @param _networkName The network name.
     */
    function initialize(
        uint256 _startingBlockNumber,
        bytes32 _startingStateRoot,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _admin,
        address _trustedSequencer,
        address _gasTokenAddress,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) external onlyAggchainManager getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        // Check the (owned) vkey selector encodes the correct aggchain type.
        // useDefaultVkeys is hardcoded false, so a valid owned selector/vkey is required.
        _validateVKeysConsistency(
            false, // useDefaultVkeys
            _initAggchainVKeySelector,
            _initOwnedAggchainVKey,
            AGGCHAIN_TYPE
        );

        // Set aggchainBase + consensusBase variables (owned vkey, owned signers).
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            false, // useDefaultVkeys
            false, // useDefaultSigners
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );

        // init Payments state
        startingBlockNumber = _startingBlockNumber;
        latestBlockNumber = _startingBlockNumber;
        lastStateRoot = _startingStateRoot;

        // set multisig signers (e.g. [aggsender]) and threshold (e.g. 1)
        _updateSignersAndThreshold(
            new RemoveSignerInfo[](0), // No signers to remove
            _signersToAdd,
            _newThreshold
        );
    }

    ////////////////////////////////////////////////////////////
    //                    Functions: views                    //
    ////////////////////////////////////////////////////////////

    /// @dev Validates the provided aggchain data and returns the computed aggchain
    ///      parameters and vkey.
    ///
    ///     aggchain_params = keccak256(abi.encodePacked(
    ///         lastStateRoot,   // bytes32 (current stored root)
    ///         newStateRoot,    // bytes32 (proposed root)
    ///         endBlock         // uint256 (proposed block number)
    ///     ))
    ///     Field:           | lastStateRoot | newStateRoot | endBlock |
    ///     length (bits):   | 256           | 256          | 256      |
    ///
    /// @param aggchainData custom bytes provided by the chain, ABI-encoded as:
    ///     Field:                  | _aggchainVKeySelector | _newStateRoot | _endBlock |
    ///     length (bits):          | 32                    | 256           | 256       |
    ///     ABI encoding (bits):    | 256                   | 256           | 256       |
    ///
    /// @return aggchainVKey The aggchain verification key for the decoded selector.
    /// @return aggchainParams The computed aggchain parameters hash.
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
            bytes32 _newStateRoot,
            uint256 _endBlock
        ) = abi.decode(aggchainData, (bytes4, bytes32, uint256));

        // Check the aggchainType embedded in the _aggchainVKeySelector is valid
        if (
            getAggchainTypeFromSelector(_aggchainVKeySelector) != AGGCHAIN_TYPE
        ) {
            revert InvalidAggchainType();
        }

        // check non-zero stateRoot
        if (_newStateRoot == bytes32(0)) {
            revert StateRootCannotBeZero();
        }

        // check strictly increasing block number
        if (_endBlock <= latestBlockNumber) {
            revert EndBlockNotGreaterThanLatest();
        }

        bytes32 aggchainParams = keccak256(
            abi.encodePacked(lastStateRoot, _newStateRoot, _endBlock)
        );

        return (getAggchainVKey(_aggchainVKeySelector), aggchainParams);
    }

    ////////////////////////////////////////////////////////////
    //               Functions: Callbacks                     //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Callback when the pessimistic proof is verified, can only be called
     *         by the rollup manager.
     * @dev Stores the new state root + block number and emits an event.
     * @param aggchainData Custom data containing (selector, newStateRoot, endBlock).
     */
    function onVerifyPessimistic(
        bytes memory aggchainData
    ) external onlyRollupManager {
        if (aggchainData.length != 32 * 3) {
            revert InvalidAggchainDataLength();
        }

        // decode the aggchainData
        (, bytes32 _newStateRoot, uint256 _endBlock) = abi.decode(
            aggchainData,
            (bytes4, bytes32, uint256)
        );

        lastStateRoot = _newStateRoot;
        latestBlockNumber = _endBlock;

        emit PaymentsStateUpdated(_newStateRoot, _endBlock);
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version String representation of the contract version.
     */
    function version() external pure returns (string memory) {
        return AGGCHAIN_PAYMENTS_VERSION;
    }
}
