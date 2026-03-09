// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAgglayerGateway.sol";
import "../interfaces/IAggchainBase.sol";
import "../interfaces/IVersion.sol";

/**
 * @title AggchainBase
 * @notice Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.
 */
abstract contract AggchainBase is
    PolygonConsensusBase,
    IAggchainBase,
    IVersion
{
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Consensus type that supports generic aggchain hash
    // Naming has been kept as CONSENSUS_TYPE for consistency with the previous consensus type (PolygonPessimisticConsensus.sol)
    uint32 public constant CONSENSUS_TYPE = 1;

    // Maximum number of aggchain signers supported
    uint256 public constant MAX_AGGCHAIN_SIGNERS = 255;

    // AgglayerGateway address, used in case the flag `useDefaultGateway` is set to true, the aggchains keys are managed by the gateway
    IAgglayerGateway public immutable aggLayerGateway;

    ////////////////////////////////////////////////////////////
    //                       Variables                        //
    ////////////////////////////////////////////////////////////
    // Added legacy storage values to avoid storage collision with PolygonValidiumEtrog contract in case this consensus contract is upgraded to aggchain
    address private _legacyDataAvailabilityProtocol;
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

    // Added legacy storage values from previous aggchainBase
    /// @custom:oz-renamed-from vKeyManager
    address public _legacyvKeyManager;
    /// @custom:oz-renamed-from pendingVKeyManager
    address public _legacypendingVKeyManager;

    // Flag to enable/disable the use of the default verification keys from the gateway
    /// @custom:oz-renamed-from useDefaultGateway
    bool public useDefaultVkeys;

    // Flag to enable or disable the use of default signers from the gateway.
    // Introduced in this version of the contract. This variable is packed into
    // the same storage slot as `useDefaultVkeys`, so there is no risk of storage
    // layout collision with previous versions.
    bool public useDefaultSigners;

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

    ////////////////////////////////////////////////////////////
    //                      Multisig                          //
    ////////////////////////////////////////////////////////////

    /// @notice Array of multisig aggchainSigners
    address[] public aggchainSigners;

    /// @notice Mapping that stores the URL of each signer
    /// It's used as well to check if an address is a signer
    mapping(address => string) public signerToURLs;

    /// @notice Threshold required for multisig operations
    uint256 public threshold;

    /// @notice Hash of the current multisig configuration.
    /// @dev Computed as keccak256(abi.encodePacked(threshold, aggchainSigners))
    bytes32 public aggchainMultisigHash;

    ////////////////////////////////////////////////////////////
    //                      Metadata                          //
    ////////////////////////////////////////////////////////////

    /// @notice Address that manages the metadata functionality
    address public aggchainMetadataManager;

    /// @notice Optional mapping to store metadata for the aggchain
    mapping(string => string) public aggchainMetadata;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[44] private __gap;

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    /// @dev Only allows a function to be callable if the message sender is the aggchain manager
    modifier onlyAggchainManager() {
        if (aggchainManager != msg.sender) {
            revert OnlyAggchainManager();
        }
        _;
    }

    /// @dev Only allows a function to be callable if the message sender is the aggchain metadata manager
    modifier onlyAggchainMetadataManager() {
        if (aggchainMetadataManager != msg.sender) {
            revert OnlyAggchainMetadataManager();
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
     * @param _aggLayerGateway AgglayerGateway address.
     */
    constructor(
        IAgglayerGER _globalExitRootManager,
        IERC20Upgradeable _pol,
        IAgglayerBridge _bridgeAddress,
        AgglayerManager _rollupManager,
        IAgglayerGateway _aggLayerGateway
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

    /**
     * @notice Sets the aggchain manager
     * @dev Can only be called by the rollup manager during initialization
     * @param newAggchainManager The address of the new aggchain manager
     */
    function initAggchainManager(
        address newAggchainManager
    ) external onlyRollupManager {
        // Can only be initialized if current aggchainmanger is zero
        if (aggchainManager != address(0)) {
            revert AggchainManagerAlreadyInitialized();
        }

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
     * @dev If a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _useDefaultVkeys Flag to use default verification keys from gateway
     * @param _useDefaultSigners Flag to use default signers from gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     */
    function _initializeAggchainBaseAndConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName,
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector
    ) internal onlyInitializing {
        if (address(_admin) == address(0) || address(sequencer) == address(0)) {
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

        _initializeAggchainBase(
            _useDefaultVkeys,
            _useDefaultSigners,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _useDefaultVkeys Flag to use default verification keys from gateway
     * @param _useDefaultSigners Flag to use default signers from gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     */
    function _initializeAggchainBase(
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector
    ) internal onlyInitializing {
        useDefaultVkeys = _useDefaultVkeys;
        useDefaultSigners = _useDefaultSigners;
        // set the initial aggchain keys
        ownedAggchainVKeys[_initAggchainVKeySelector] = _initOwnedAggchainVKey;
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
    //              Virtual functions            //
    ///////////////////////////////////////////////

    /**
     * @notice Abstract function to extract aggchain parameters and verification key from aggchain data
     * @dev This function must be implemented by the inheriting contract
     * @param aggchainData Custom bytes provided by the chain containing the aggchain data
     * @return aggchainVKey The extracted aggchain verification key
     * @return aggchainParams The extracted aggchain parameters
     */
    function getVKeyAndAggchainParams(
        bytes memory aggchainData
    ) public view virtual returns (bytes32, bytes32);

    ///////////////////////////////////////////////
    //     Rollup manager callback functions     //
    ///////////////////////////////////////////////

    /**
     * @notice Callback while pessimistic proof is being verified from the rollup manager
     *
     *     aggchain_hash:
     *     Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  | multisig_hash |
     *     length (bits):   | 32             | 256            | 256              | 256           |
     *
     * @dev Returns the aggchain hash for a given aggchain data
     * @param aggchainData Custom bytes provided by the chain containing the aggchain data
     * @return aggchainHash resulting aggchain hash
     */
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        // Get signers hash from gateway if using default signers, otherwise use local storage
        bytes32 cachedMultisigHash = getAggchainMultisigHash();

        (
            bytes32 aggchainVKey,
            bytes32 aggchainParams
        ) = getVKeyAndAggchainParams(aggchainData);

        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    aggchainVKey,
                    aggchainParams,
                    cachedMultisigHash
                )
            );
    }

    ///////////////////////////////////////////////
    //        aggchainManager functions          //
    ///////////////////////////////////////////////

    /**
     * @notice Updates signers and threshold for multisig operations
     * @dev External wrapper for _updateSignersAndThreshold, restricted to aggchainManager
     * @param _signersToRemove Array of signers to remove with their indices
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value for multisig operations
     */
    function updateSignersAndThreshold(
        RemoveSignerInfo[] memory _signersToRemove,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager {
        _updateSignersAndThreshold(
            _signersToRemove,
            _signersToAdd,
            _newThreshold
        );
    }

    /**
     * @notice Batch update signers and threshold in a single transaction
     * @dev Removes signers first (in descending index order), then adds new signers, then updates threshold
     * @param _signersToRemove Array of signers to remove with their indices (MUST be in descending index order)
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value
     */
    function _updateSignersAndThreshold(
        RemoveSignerInfo[] memory _signersToRemove,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) internal {
        // Validate descending order of indices for removal to avoid index shifting issues
        // When removing multiple signers, we must process them from highest index to lowest
        if (_signersToRemove.length > 1) {
            for (uint256 i = 0; i < _signersToRemove.length - 1; i++) {
                if (
                    _signersToRemove[i].index <= _signersToRemove[i + 1].index
                ) {
                    revert IndicesNotInDescendingOrder();
                }
            }
        }

        // Remove signers (in descending index order to avoid index shifting issues)
        for (uint256 i = 0; i < _signersToRemove.length; i++) {
            _removeSignerInternal(
                _signersToRemove[i].addr,
                _signersToRemove[i].index
            );
        }

        // Add new signers
        for (uint256 i = 0; i < _signersToAdd.length; i++) {
            _addSignerInternal(_signersToAdd[i].addr, _signersToAdd[i].url);
        }

        if (aggchainSigners.length > MAX_AGGCHAIN_SIGNERS) {
            revert AggchainSignersTooHigh();
        }

        if (
            _newThreshold > aggchainSigners.length ||
            (aggchainSigners.length != 0 && _newThreshold == 0)
        ) {
            revert InvalidThreshold();
        }

        threshold = _newThreshold;

        // Update the signers hash once after all operations
        _updateAggchainMultisigHash();
    }

    /**
     * @notice Starts the aggchainManager role transfer
     * @dev This is a two step process, the pending aggchainManager must accept to finalize the process
     * @param newAggchainManager Address of the new aggchainManager
     */
    function transferAggchainManagerRole(
        address newAggchainManager
    ) external onlyAggchainManager {
        if (newAggchainManager == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingAggchainManager = newAggchainManager;

        emit TransferAggchainManagerRole(aggchainManager, newAggchainManager);
    }

    /**
     * @notice Allow the current pending aggchainManager to accept the aggchainManager role
     * @dev Can only be called by the pending aggchainManager
     */
    function acceptAggchainManagerRole() external {
        if (pendingAggchainManager != msg.sender) {
            revert OnlyPendingAggchainManager();
        }

        address oldAggchainManager = aggchainManager;
        aggchainManager = pendingAggchainManager;
        delete pendingAggchainManager;

        emit AcceptAggchainManagerRole(oldAggchainManager, aggchainManager);
    }

    /**
     * @notice Sets the aggchain metadata manager
     * @dev Can only be called by the aggchain manager
     * @param newAggchainMetadataManager Address of the new aggchain metadata manager
     */
    function setAggchainMetadataManager(
        address newAggchainMetadataManager
    ) external onlyAggchainManager {
        address oldAggchainMetadataManager = aggchainMetadataManager;
        aggchainMetadataManager = newAggchainMetadataManager;

        emit SetAggchainMetadataManager(
            oldAggchainMetadataManager,
            newAggchainMetadataManager
        );
    }

    /**
     * @notice Enable the use of default verification keys from gateway
     */
    function enableUseDefaultVkeysFlag() external virtual onlyAggchainManager {
        if (useDefaultVkeys) {
            revert UseDefaultVkeysAlreadyEnabled();
        }

        useDefaultVkeys = true;

        // Emit event
        emit EnableUseDefaultVkeysFlag();
    }

    /**
     * @notice Disable the use of default verification keys from gateway
     */
    function disableUseDefaultVkeysFlag() external virtual onlyAggchainManager {
        if (!useDefaultVkeys) {
            revert UseDefaultVkeysAlreadyDisabled();
        }

        useDefaultVkeys = false;

        // Emit event
        emit DisableUseDefaultVkeysFlag();
    }

    /**
     * @notice Enable the use of default signers from gateway
     */
    function enableUseDefaultSignersFlag() external onlyAggchainManager {
        if (useDefaultSigners) {
            revert UseDefaultSignersAlreadyEnabled();
        }

        useDefaultSigners = true;

        // Emit event
        emit EnableUseDefaultSignersFlag();
    }

    /**
     * @notice Disable the use of default signers from gateway
     */
    function disableUseDefaultSignersFlag() external onlyAggchainManager {
        if (!useDefaultSigners) {
            revert UseDefaultSignersAlreadyDisabled();
        }

        useDefaultSigners = false;

        // Emit event
        emit DisableUseDefaultSignersFlag();
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 newAggchainVKey
    ) external virtual onlyAggchainManager {
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
    ) external virtual onlyAggchainManager {
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

    /**
     * @notice Sets or updates metadata for the aggchain.
     * @dev Can only be called by the aggchain metadata manager. Empty values are allowed to clear metadata.
     * @param key The metadata key to set.
     * @param value The metadata value to set.
     */
    function setAggchainMetadata(
        string calldata key,
        string calldata value
    ) external onlyAggchainMetadataManager {
        _setAggchainMetadataInternal(key, value);
    }

    /**
     * @notice Sets or updates multiple metadata entries in a single transaction.
     * @dev Can only be called by the aggchain metadata manager.
     * @param keys Array of metadata keys to set.
     * @param values Array of metadata values to set (must be same length as keys).
     */
    function batchSetAggchainMetadata(
        string[] calldata keys,
        string[] calldata values
    ) external onlyAggchainMetadataManager {
        uint256 length = keys.length;
        if (length != values.length) {
            revert MetadataArrayLengthMismatch();
        }

        for (uint256 i = 0; i < length; i++) {
            _setAggchainMetadataInternal(keys[i], values[i]);
        }
    }

    //////////////////////////
    //    view functions    //
    //////////////////////////

    /**
     * @notice returns the current aggchain verification key. If the flag `useDefaultVkeys` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     * @return aggchainVKey The verification key for the specified selector
     */
    function getAggchainVKey(
        bytes4 aggchainVKeySelector
    ) public view virtual returns (bytes32 aggchainVKey) {
        if (useDefaultVkeys == false) {
            aggchainVKey = ownedAggchainVKeys[aggchainVKeySelector];

            if (aggchainVKey == bytes32(0)) {
                revert AggchainVKeyNotFound();
            }
        } else {
            // Retrieve aggchain key from AgglayerGateway
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
     * @return getAggchainVKeySelector computed bytes4 selector combining version and type
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
     * @return AGGCHAIN_TYPE extracted aggchain type (last 2 bytes)
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
     * @return aggchainVKeyVersion extracted aggchain verification key version (first 2 bytes)
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainVKeyVersionFromSelector(
        bytes4 aggchainVKeySelector
    ) public pure returns (bytes2) {
        return bytes2(aggchainVKeySelector);
    }

    /**
     * @notice Get the threshold for the multisig
     * @return threshold for the multisig
     */
    function getThreshold() external view returns (uint256) {
        if (useDefaultSigners) {
            return aggLayerGateway.getThreshold();
        }
        return threshold;
    }

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) public view returns (bool) {
        if (useDefaultSigners) {
            return aggLayerGateway.isSigner(_signer);
        }
        return bytes(signerToURLs[_signer]).length > 0;
    }

    /**
     * @notice Get the number of aggchainSigners
     * @return Number of aggchainSigners in the multisig
     */
    function getAggchainSignersCount() external view returns (uint256) {
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainSignersCount();
        }
        return aggchainSigners.length;
    }

    /**
     * @notice Get all aggchainSigners
     * @return Array of signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory) {
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainSigners();
        }
        return aggchainSigners;
    }

    /**
     * @notice Get the aggchain signers hash
     * @return The aggchain signers hash
     */
    function getAggchainMultisigHash() public view returns (bytes32) {
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainMultisigHash();
        }

        // Sanity check to realize earlier that the aggchainMultisigHash has not been set given
        // that the proof cannot be computed since there is no hash reconstruction to be 0
        if (aggchainMultisigHash == bytes32(0)) {
            revert AggchainSignersHashNotInitialized();
        }

        return aggchainMultisigHash;
    }
    /**
     * @notice Get all aggchainSigners with their URLs
     * @return Array of SignerInfo structs containing signer addresses and URLs
     */
    function getAggchainSignerInfos()
        external
        view
        returns (SignerInfo[] memory)
    {
        if (useDefaultSigners) {
            // Get signers with URLs directly from gateway
            return aggLayerGateway.getAggchainSignerInfos();
        } else {
            // Use local aggchainSigners
            SignerInfo[] memory signerInfos = new SignerInfo[](
                aggchainSigners.length
            );
            for (uint256 i = 0; i < aggchainSigners.length; i++) {
                signerInfos[i] = SignerInfo({
                    addr: aggchainSigners[i],
                    url: signerToURLs[aggchainSigners[i]]
                });
            }
            return signerInfos;
        }
    }

    ////////////////////////////////////////////////////////////
    //                   Internal Functions                   //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Internal function to add a signer with validation
     * @dev Validates that signer is not zero address, URL is not empty, and signer doesn't already exist
     * @param _signer Address of the signer to add
     * @param url URL associated with the signer
     */
    function _addSignerInternal(address _signer, string memory url) internal {
        if (_signer == address(0)) {
            revert SignerCannotBeZero();
        }

        if (bytes(url).length == 0) {
            revert SignerURLCannotBeEmpty();
        }

        if (bytes(signerToURLs[_signer]).length > 0) {
            revert SignerAlreadyExists();
        }

        aggchainSigners.push(_signer);
        signerToURLs[_signer] = url;
    }

    /**
     * @notice Internal function to remove a signer with validation
     * @dev Validates index bounds and that the signer at the index matches the provided address
     * @param _signer Address of the signer to remove
     * @param _signerIndex Index of the signer in the aggchainSigners array
     */
    function _removeSignerInternal(
        address _signer,
        uint256 _signerIndex
    ) internal {
        // Cache array length
        uint256 signersLength = aggchainSigners.length;

        // Validate input parameters
        if (_signerIndex >= signersLength) {
            revert SignerDoesNotExist();
        }

        if (aggchainSigners[_signerIndex] != _signer) {
            revert SignerDoesNotExist();
        }

        // Remove from mapping
        delete signerToURLs[_signer];

        // Move the last element to the deleted spot and remove the last element
        aggchainSigners[_signerIndex] = aggchainSigners[signersLength - 1];

        aggchainSigners.pop();
    }

    /**
     * @notice Update the hash of the aggchainSigners array
     * @dev Combines threshold and signers array into a single hash for efficient verification
     */
    function _updateAggchainMultisigHash() internal {
        aggchainMultisigHash = keccak256(
            abi.encodePacked(threshold, aggchainSigners)
        );

        emit SignersAndThresholdUpdated(
            aggchainSigners,
            threshold,
            aggchainMultisigHash
        );
    }

    /**
     * @notice Internal function to set or update metadata for the aggchain
     * @dev Empty values are allowed to clear metadata
     * @param key The metadata key to set
     * @param value The metadata value to set
     */
    function _setAggchainMetadataInternal(
        string memory key,
        string memory value
    ) internal {
        aggchainMetadata[key] = value;
        emit AggchainMetadataSet(key, value);
    }

    /**
     * @dev Internal function to validate VKeys consistency
     * @param _useDefaultVkeys Whether to use default verification keys
     * @param _initAggchainVKeySelector The aggchain verification key selector
     * @param _initOwnedAggchainVKey The owned aggchain verification key
     * @param aggchainType The expected aggchain type
     */
    function _validateVKeysConsistency(
        bool _useDefaultVkeys,
        bytes4 _initAggchainVKeySelector,
        bytes32 _initOwnedAggchainVKey,
        bytes2 aggchainType
    ) internal pure {
        // Check the use default vkeys is consistent
        if (_useDefaultVkeys) {
            if (
                _initAggchainVKeySelector != bytes4(0) ||
                _initOwnedAggchainVKey != bytes32(0)
            ) {
                revert InvalidInitAggchainVKey();
            }
        } else {
            if (
                getAggchainTypeFromSelector(_initAggchainVKeySelector) !=
                aggchainType
            ) {
                revert InvalidAggchainType();
            }
        }
    }
}
