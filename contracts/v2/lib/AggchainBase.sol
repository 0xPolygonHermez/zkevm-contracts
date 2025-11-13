// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";
import "../interfaces/IAggchainBase.sol";

/**
 * @title AggchainBase
 * @notice Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.
 */
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Consensus type that supports generic aggchain hash
    // Naming has been kept as CONSENSUS_TYPE for consistency with the previous consensus type (PolygonPessimisticConsensus.sol)
    uint32 public constant CONSENSUS_TYPE = 1;

    // AggLayerGateway address, used in case the flag `useDefaultGateway` is set to true, the aggchains keys are managed by the gateway
    IAggLayerGateway public immutable aggLayerGateway;

    ////////////////////////////////////////////////////////////
    //                       Variables                        //
    ////////////////////////////////////////////////////////////
    // Added legacy storage values to avoid storage collision with PolygonValidiumEtrog contract in case this consensus contract is upgraded to aggchain
    address private _legacyDataAvailabilityProtocol;
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

    // Address that will be able to manage the aggchain verification keys and swap the useDefaultGateway flag.
    address public vKeyManager;

    // This account will be able to accept the vKeyManager role
    address public pendingVKeyManager;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true, the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway;

    /// @notice Address that manages all the functionalities related to the aggchain
    address public aggchainManager;

    /// @notice This account will be able to accept the aggchainManager role
    address public pendingAggchainManager;

    ////////////////////////////////////////////////////////////
    //                       Mappings                         //
    ////////////////////////////////////////////////////////////
    // AggchainVKeys mapping
    mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey)
        public ownedAggchainVKeys;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[50] private __gap;

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    // Modifier to check if the caller is the vKeyManager
    modifier onlyVKeyManager() {
        if (vKeyManager != msg.sender) {
            revert OnlyVKeyManager();
        }
        _;
    }

    /// @dev Only allows a function to be callable if the message sender is the aggchain manager
    modifier onlyAggchainManager() {
        if (aggchainManager != msg.sender) {
            revert OnlyAggchainManager();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _rollupManager Rollup manager address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        // Check if the gateway address is valid
        if (
            address(_aggLayerGateway) == address(0) ||
            address(_globalExitRootManager) == address(0) ||
            address(_pol) == address(0) ||
            address(_bridgeAddress) == address(0) ||
            address(_rollupManager) == address(0)
        ) {
            revert InvalidZeroAddress();
        }
        aggLayerGateway = _aggLayerGateway;
    }

    ////////////////////////////////////////////////////////////
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////

    /// @notice Sets the aggchain manager.
    /// @param newAggchainManager The address of the new aggchain manager.
    function initAggchainManager(
        address newAggchainManager
    ) external onlyRollupManager {
        if (newAggchainManager == address(0)) {
            revert AggchainManagerCannotBeZero();
        }

        aggchainManager = newAggchainManager;

        emit AcceptAggchainManagerRole(address(0), aggchainManager);
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _useDefaultGateway Flag to setup initial values for the default gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBaseAndConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName,
        bool _useDefaultGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _vKeyManager
    ) internal onlyInitializing {
        if (
            address(_admin) == address(0) ||
            address(sequencer) == address(0) ||
            address(_vKeyManager) == address(0)
        ) {
            revert InvalidZeroAddress();
        }

        // Initialize PolygonConsensusBase
        _initializePolygonConsensusBase(
            _admin,
            sequencer,
            _gasTokenAddress,
            sequencerURL,
            _networkName
        );

        useDefaultGateway = _useDefaultGateway;

        ownedAggchainVKeys[_initAggchainVKeySelector] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _useDefaultGateway Flag to setup initial values for the default gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBase(
        bool _useDefaultGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _vKeyManager
    ) internal onlyInitializing {
        useDefaultGateway = _useDefaultGateway;
        // set the initial aggchain keys
        ownedAggchainVKeys[_initAggchainVKeySelector] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    /**
     * @notice Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.
     * @dev removing this function can cause critical security issues.
     */
    function initialize(
        address, // _admin
        address, // sequencer
        uint32, //networkID,
        address, // _gasTokenAddress,
        string memory, // sequencerURL,
        string memory // _networkName
    ) external pure override(PolygonConsensusBase) {
        // Set initialize variables
        revert InvalidInitializeFunction();
    }

    ///////////////////////////////////////////////
    //        aggchainManager functions         //
    ///////////////////////////////////////////////

    /// @notice Starts the aggchainManager role transfer
    ///         This is a two step process, the pending aggchainManager must accept to finalize the process
    /// @param newAggchainManager Address of the new aggchainManager
    function transferAggchainManagerRole(
        address newAggchainManager
    ) external onlyAggchainManager {
        if (newAggchainManager == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingAggchainManager = newAggchainManager;

        emit TransferAggchainManagerRole(aggchainManager, newAggchainManager);
    }

    /// @notice Allow the current pending aggchainManager to accept the aggchainManager role
    function acceptAggchainManagerRole() external {
        if (pendingAggchainManager != msg.sender) {
            revert OnlyPendingAggchainManager();
        }

        address oldAggchainManager = aggchainManager;
        aggchainManager = pendingAggchainManager;
        delete pendingAggchainManager;

        emit AcceptAggchainManagerRole(oldAggchainManager, aggchainManager);
    }

    ///////////////////////////////
    //   VKeyManager functions   //
    //////////////////////////////

    /**
     * @notice Starts the vKeyManager role transfer
     * This is a two step process, the pending vKeyManager must accepted to finalize the process
     * @param newVKeyManager Address of the new pending admin
     */
    function transferVKeyManagerRole(
        address newVKeyManager
    ) external onlyVKeyManager {
        pendingVKeyManager = newVKeyManager;

        emit TransferVKeyManagerRole(vKeyManager, newVKeyManager);
    }

    /**
     * @notice Allow the current pending vKeyManager to accept the vKeyManager role
     */
    function acceptVKeyManagerRole() external {
        if (pendingVKeyManager != msg.sender) {
            revert OnlyPendingVKeyManager();
        }

        address oldVKeyManager = vKeyManager;
        vKeyManager = pendingVKeyManager;
        delete pendingVKeyManager;

        emit AcceptVKeyManagerRole(oldVKeyManager, vKeyManager);
    }

    /**
     * @notice Enable the use of the default gateway to manage the aggchain keys.
     */
    function enableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (useDefaultGateway) {
            revert UseDefaultGatewayAlreadyEnabled();
        }

        useDefaultGateway = true;

        // Emit event
        emit EnableUseDefaultGatewayFlag();
    }

    /**
     * @notice Disable the use of the default gateway to manage the aggchain keys. After disable, the keys are handled by the aggchain contract.
     */
    function disableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (!useDefaultGateway) {
            revert UseDefaultGatewayAlreadyDisabled();
        }

        useDefaultGateway = false;

        // Emit event
        emit DisableUseDefaultGatewayFlag();
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 newAggchainVKey
    ) external onlyVKeyManager {
        if (newAggchainVKey == bytes32(0)) {
            revert ZeroValueAggchainVKey();
        }
        // Check if proposed selector has already a verification key assigned
        if (ownedAggchainVKeys[aggchainVKeySelector] != bytes32(0)) {
            revert OwnedAggchainVKeyAlreadyAdded();
        }

        ownedAggchainVKeys[aggchainVKeySelector] = newAggchainVKey;

        emit AddAggchainVKey(aggchainVKeySelector, newAggchainVKey);
    }

    /**
     * @notice Update the aggchain verification key in the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param updatedAggchainVKey The updated aggchain verification key value.
     */
    function updateOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 updatedAggchainVKey
    ) external onlyVKeyManager {
        // Check already added
        if (ownedAggchainVKeys[aggchainVKeySelector] == bytes32(0)) {
            revert OwnedAggchainVKeyNotFound();
        }

        bytes32 previousAggchainVKey = ownedAggchainVKeys[aggchainVKeySelector];
        ownedAggchainVKeys[aggchainVKeySelector] = updatedAggchainVKey;

        emit UpdateAggchainVKey(
            aggchainVKeySelector,
            previousAggchainVKey,
            updatedAggchainVKey
        );
    }

    //////////////////////////
    //    view functions    //
    //////////////////////////

    /**
     * @notice returns the current aggchain verification key. If the flag `useDefaultGateway` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     */
    function getAggchainVKey(
        bytes4 aggchainVKeySelector
    ) public view returns (bytes32 aggchainVKey) {
        if (useDefaultGateway == false) {
            aggchainVKey = ownedAggchainVKeys[aggchainVKeySelector];

            if (aggchainVKey == bytes32(0)) {
                revert AggchainVKeyNotFound();
            }
        } else {
            // Retrieve aggchain key from AggLayerGateway
            aggchainVKey = aggLayerGateway.getDefaultAggchainVKey(
                aggchainVKeySelector
            );
        }
    }

    /**
     * @notice Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeyVersion.
     * @dev It joins two bytes2 values into a bytes4 value.
     * @param aggchainVKeyVersion The aggchain verification key version, used to identify the aggchain verification key.
     * @param aggchainType The aggchain type, hardcoded in the aggchain contract.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainVKeySelector(
        bytes2 aggchainVKeyVersion,
        bytes2 aggchainType
    ) public pure returns (bytes4) {
        return bytes4(aggchainVKeyVersion) | (bytes4(aggchainType) >> 16);
    }

    /**
     * @notice Computes the aggchainType from the aggchainVKeySelector.
     * @param aggchainVKeySelector The aggchain verification key selector.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainTypeFromSelector(
        bytes4 aggchainVKeySelector
    ) public pure returns (bytes2) {
        return bytes2(aggchainVKeySelector << 16);
    }

    /**
     * @notice Computes the aggchainVKeyVersion from the aggchainVKeySelector.
     * @param aggchainVKeySelector The aggchain verification key selector.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainVKeyVersionFromSelector(
        bytes4 aggchainVKeySelector
    ) public pure returns (bytes2) {
        return bytes2(aggchainVKeySelector);
    }
}
