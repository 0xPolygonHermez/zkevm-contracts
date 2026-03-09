// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ISP1Verifier} from "./interfaces/ISP1Verifier.sol";
import {IAgglayerGateway} from "./interfaces/IAgglayerGateway.sol";
import {IVersion} from "./interfaces/IVersion.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable5/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/AccessControlUpgradeable.sol";
// Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol

/**
 * @title AgglayerGateway
 * @notice Contract to handle the verification keys for the pessimistic proof.
 * It supports adding and freezing PP verification keys and verifying the PP.
 * Also maintains the default verification keys of aggchains
 */
contract AgglayerGateway is
    Initializable,
    AccessControlUpgradeable,
    IAgglayerGateway,
    IVersion
{
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Roles
    // Default admin role, can grant roles to addresses
    // @dev value: 0x131410eab1236cee2db19035b0e825c94e5ab705dffe23321dd53856da531617
    bytes32 internal constant AGGCHAIN_DEFAULT_VKEY_ROLE =
        keccak256("AGGCHAIN_DEFAULT_VKEY_ROLE");

    // Can add a route to a pessimistic verification key.
    // @dev value 0x0fdc2a718b96bc741c7544001e3dd7c26730802c54781668fa78a120e622629b
    bytes32 internal constant AL_ADD_PP_ROUTE_ROLE =
        keccak256("AL_ADD_PP_ROUTE_ROLE");

    // Can freeze a route to a pessimistic verification key.
    // @dev value 0xca75ae4228cde6195f9fa3dbde8dc352fb30aa63780717a378ccfc50274355dd
    bytes32 internal constant AL_FREEZE_PP_ROUTE_ROLE =
        keccak256("AL_FREEZE_PP_ROUTE_ROLE");

    // Can manage multisig signers and threshold
    // @dev value 0x0c3038a1ecdf82843b70709289ff1703351ad391e3e27df7f6fa7d913601e15e
    bytes32 internal constant AL_MULTISIG_ROLE = keccak256("AL_MULTISIG_ROLE");

    // Current AgglayerGateway version
    string public constant AGGLAYER_GATEWAY_VERSION = "v1.1.0";

    // Maximum number of aggchain signers supported
    uint256 public constant MAX_AGGCHAIN_SIGNERS = 255;

    ////////////////////////////////////////////////////////////
    //                  Transient Storage                     //
    ////////////////////////////////////////////////////////////

    /// @notice Value to detect if the contract has been initialized previously.
    uint64 private transient _initializerVersion;

    ////////////////////////////////////////////////////////////
    //                       Mappings                         //
    ////////////////////////////////////////////////////////////
    // Mapping with the default aggchain verification keys
    mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey)
        public defaultAggchainVKeys;

    // Mapping with the pessimistic verification key routes
    mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute)
        public pessimisticVKeyRoutes;

    ////////////////////////////////////////////////////////////
    //                      Multisig                          //
    ////////////////////////////////////////////////////////////

    /// @notice Array of multisig aggchainSigners
    address[] public aggchainSigners;

    /// @notice Mapping that stores the URL of each signer
    /// It's used as well to check if an address is a signer
    mapping(address => string) public signerToURLs;

    /// @notice Threshold required for multisig operations
    uint256 internal threshold;

    /// @notice Hash of the current aggchainSigners array
    bytes32 public aggchainMultisigHash;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * Updated to account for new multisig storage variables (4 slots used)
     */
    uint256[46] private __gap;

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @dev Disable initializers on the implementation following the best practices.
     */
    constructor() {
        // disable initializers for implementation contract
        _disableInitializers();
    }

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    /// @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier getInitializedVersion() {
        _initializerVersion = _getInitializedVersion();
        _;
    }

    ////////////////////////////////////////////////////////////
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////
    /**
     * @notice  Initializer function to set up the AgglayerGateway contract.
     * @param defaultAdmin The address of the default admin. Can grant role to addresses.
     * @dev This address is the highest privileged address so it's recommended to use a timelock
     * @param aggchainDefaultVKeyRole The address that can manage the aggchain verification keys.
     * @param addRouteRole The address that can add a route to a pessimistic verification key.
     * @param freezeRouteRole The address that can freeze a route to a pessimistic verification key.
     * @param pessimisticVKeySelector The 4 bytes selector to add to the pessimistic verification keys.
     * @param verifier The address of the verifier contract.
     * @param pessimisticVKey New pessimistic program verification key.
     * @param multisigRole The address that can manage multisig signers and threshold.
     * @param signersToAdd Array of signers to add with their URLs
     * @param newThreshold New threshold value
     */
    function initialize(
        address defaultAdmin,
        address aggchainDefaultVKeyRole,
        address addRouteRole,
        address freezeRouteRole,
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey,
        address multisigRole,
        SignerInfo[] memory signersToAdd,
        uint256 newThreshold
    ) external getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 0) {
            revert InvalidInitializer();
        }

        if (
            multisigRole == address(0) ||
            defaultAdmin == address(0) ||
            aggchainDefaultVKeyRole == address(0) ||
            addRouteRole == address(0) ||
            freezeRouteRole == address(0)
        ) {
            revert InvalidZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainDefaultVKeyRole);
        _grantRole(AL_ADD_PP_ROUTE_ROLE, addRouteRole);
        _grantRole(AL_FREEZE_PP_ROUTE_ROLE, freezeRouteRole);
        _grantRole(AL_MULTISIG_ROLE, multisigRole);

        _addPessimisticVKeyRoute(
            pessimisticVKeySelector,
            verifier,
            pessimisticVKey
        );

        // Add the signers to the contract
        _updateSignersAndThreshold(
            new RemoveSignerInfo[](0), // No signers to remove
            signersToAdd,
            newThreshold
        );
    }

    /**
     * @notice Upgrade initializer to add multisig functionality to existing deployment.
     * @param multisigRole The address of the multisig role. Can manage multisig signers and threshold.
     * @param signersToAdd Array of signers to add with their URLs
     * @param newThreshold New threshold value
     */
    function initialize(
        address multisigRole,
        SignerInfo[] memory signersToAdd,
        uint256 newThreshold
    ) external getInitializedVersion reinitializer(2) {
        if (_initializerVersion != 1) {
            revert InvalidInitializer();
        }

        if (multisigRole == address(0)) {
            revert InvalidZeroAddress();
        }

        _grantRole(AL_MULTISIG_ROLE, multisigRole);

        // Add the signers to the contract
        _updateSignersAndThreshold(
            new RemoveSignerInfo[](0), // No signers to remove
            signersToAdd,
            newThreshold
        );
    }

    ////////////////////////////////////////////////////////////
    //        Functions: AgglayerGateway (pessimistic)        //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Function to verify the pessimistic proof.
     * @param publicValues Public values of the proof.
     * @param proofBytes Proof for the pessimistic verification.
     * @dev First 4 bytes of the pessimistic proof are the pp selector.
     * proof[0:4]: 4 bytes selector pp
     * proof[4:8]: 4 bytes selector SP1 verifier
     * proof[8:]: proof
     */
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {
        /// @dev By protocol the proof should at least have the 4 bytes selector, the other bytes are not part of our protocol
        if (proofBytes.length < 4) {
            revert InvalidProofBytesLength();
        }

        bytes4 ppSelector = bytes4(proofBytes[:4]);

        AggLayerVerifierRoute memory route = pessimisticVKeyRoutes[ppSelector];
        if (route.verifier == address(0)) {
            revert RouteNotFound(ppSelector);
        } else if (route.frozen) {
            revert RouteIsFrozen(ppSelector);
        }

        ISP1Verifier(route.verifier).verifyProof(
            route.pessimisticVKey,
            publicValues,
            proofBytes[4:]
        );
    }

    /**
     * @notice Internal function to add a pessimistic verification key route
     * @param pessimisticVKeySelector The 4 bytes selector to add to the pessimistic verification keys.
     * @param verifier The address of the verifier contract.
     * @param pessimisticVKey New pessimistic program verification key
     */
    function _addPessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) internal {
        if (verifier == address(0)) {
            revert InvalidZeroAddress();
        }

        if (pessimisticVKeySelector == bytes4(0)) {
            revert PPSelectorCannotBeZero();
        }
        if (pessimisticVKey == bytes32(0)) {
            revert VKeyCannotBeZero();
        }

        AggLayerVerifierRoute storage route = pessimisticVKeyRoutes[
            pessimisticVKeySelector
        ];
        if (route.verifier != address(0)) {
            revert RouteAlreadyExists(pessimisticVKeySelector, route.verifier);
        }

        route.verifier = verifier;
        route.pessimisticVKey = pessimisticVKey;
        emit RouteAdded(pessimisticVKeySelector, verifier, pessimisticVKey);
    }

    /**
     * @notice Function to add a pessimistic verification key route
     * @param pessimisticVKeySelector The 4 bytes selector to add to the pessimistic verification keys.
     * @param verifier The address of the verifier contract.
     * @param pessimisticVKey New pessimistic program verification key
     */
    function addPessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) external onlyRole(AL_ADD_PP_ROUTE_ROLE) {
        _addPessimisticVKeyRoute(
            pessimisticVKeySelector,
            verifier,
            pessimisticVKey
        );
    }

    /**
     * @notice Function to freeze a pessimistic verification key route
     * @param pessimisticVKeySelector The 4 bytes selector to freeze the pessimistic verification key route.
     */
    function freezePessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector
    ) external onlyRole(AL_FREEZE_PP_ROUTE_ROLE) {
        AggLayerVerifierRoute storage route = pessimisticVKeyRoutes[
            pessimisticVKeySelector
        ];
        if (route.verifier == address(0)) {
            revert RouteNotFound(pessimisticVKeySelector);
        }
        if (route.frozen) {
            revert RouteIsAlreadyFrozen(pessimisticVKeySelector);
        }

        route.frozen = true;

        emit RouteFrozen(
            pessimisticVKeySelector,
            route.verifier,
            route.pessimisticVKey
        );
    }

    ////////////////////////////////////////////////////////////
    //            Functions: defaultAggchainVkey              //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Function to add an aggchain verification key
     * @param defaultAggchainSelector The 4 bytes selector to add to the default aggchain verification keys.
     * @dev First 2 bytes of the selector  are the 'verification key identifier', the last 2 bytes are the aggchain type (ex: FEP, ECDSA)
     * @param newAggchainVKey New default aggchain verification key to be added
     */
    function addDefaultAggchainVKey(
        bytes4 defaultAggchainSelector,
        bytes32 newAggchainVKey
    ) external onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE) {
        // Check already exists
        if (defaultAggchainVKeys[defaultAggchainSelector] != bytes32(0)) {
            revert AggchainVKeyAlreadyExists();
        }

        // Check new key is non-zero
        if (newAggchainVKey == bytes32(0)) {
            revert VKeyCannotBeZero();
        }

        // Add the new VKey to the mapping
        defaultAggchainVKeys[defaultAggchainSelector] = newAggchainVKey;

        emit AddDefaultAggchainVKey(defaultAggchainSelector, newAggchainVKey);
    }

    /**
     * @notice Function to update a default aggchain verification key from the mapping
     * @param defaultAggchainSelector The 4 bytes selector to update the default aggchain verification keys.
     * @param newDefaultAggchainVKey Updated default aggchain verification key value
     */
    function updateDefaultAggchainVKey(
        bytes4 defaultAggchainSelector,
        bytes32 newDefaultAggchainVKey
    ) external onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE) {
        // Check if the key exists
        if (defaultAggchainVKeys[defaultAggchainSelector] == bytes32(0)) {
            revert AggchainVKeyNotFound();
        }

        // Check new key is non-zero
        if (newDefaultAggchainVKey == bytes32(0)) {
            revert VKeyCannotBeZero();
        }

        // Update the VKey
        bytes32 previousVKey = defaultAggchainVKeys[defaultAggchainSelector];
        defaultAggchainVKeys[defaultAggchainSelector] = newDefaultAggchainVKey;

        emit UpdateDefaultAggchainVKey(
            defaultAggchainSelector,
            previousVKey,
            newDefaultAggchainVKey
        );
    }

    /**
     * @notice Function to unset a default aggchain verification key from the mapping
     * @param defaultAggchainSelector The 4 bytes selector to update the default aggchain verification keys.
     */
    function unsetDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external onlyRole(AGGCHAIN_DEFAULT_VKEY_ROLE) {
        // Check if the key exists
        if (defaultAggchainVKeys[defaultAggchainSelector] == bytes32(0)) {
            revert AggchainVKeyNotFound();
        }

        // Set key to zero
        defaultAggchainVKeys[defaultAggchainSelector] = bytes32(0);

        emit UnsetDefaultAggchainVKey(defaultAggchainSelector);
    }

    /**
     * @notice function to retrieve the default aggchain verification key.
     * @param defaultAggchainSelector The default aggchain selector for the verification key.
     * @dev First 2 bytes of the selector  are the 'verification key identifier', the last 2 bytes are the aggchain type (ex: FEP, ECDSA)
     */
    function getDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external view returns (bytes32) {
        if (defaultAggchainVKeys[defaultAggchainSelector] == bytes32(0)) {
            revert AggchainVKeyNotFound();
        }

        return defaultAggchainVKeys[defaultAggchainSelector];
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return AGGLAYER_GATEWAY_VERSION;
    }

    ////////////////////////////////////////////////////////////
    //                  Multisig Functions                    //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Updates signers and threshold for multisig operations
     * @dev Removes signers first (in descending index order), then adds new signers, then updates threshold
     * @param _signersToRemove Array of signers to remove with their indices (MUST be in descending index order)
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value
     */
    function updateSignersAndThreshold(
        RemoveSignerInfo[] memory _signersToRemove,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyRole(AL_MULTISIG_ROLE) {
        _updateSignersAndThreshold(
            _signersToRemove,
            _signersToAdd,
            _newThreshold
        );
    }

    /**
     * @notice Batch update signers and threshold in a single transaction
     * @dev Internal function that handles the actual logic
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
     * @notice Internal function to add a signer with validation
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

        if (isSigner(_signer)) {
            revert SignerAlreadyExists();
        }

        aggchainSigners.push(_signer);
        signerToURLs[_signer] = url;
    }

    /**
     * @notice Internal function to remove a signer with validation
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
     * @notice Get the threshold for the multisig
     * @return threshold for the multisig
     */
    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) public view returns (bool) {
        return bytes(signerToURLs[_signer]).length > 0;
    }

    /**
     * @notice Get the number of aggchainSigners
     * @return Number of aggchainSigners in the multisig
     */
    function getAggchainSignersCount() external view returns (uint256) {
        return aggchainSigners.length;
    }

    /**
     * @notice Get all aggchainSigners
     * @return Array of signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory) {
        return aggchainSigners;
    }

    /**
     * @notice Returns the aggchain signers hash for verification
     * @dev Used by aggchain contracts to include in their hash computation
     * @return The current aggchainMultisigHash
     */
    function getAggchainMultisigHash() external view returns (bytes32) {
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
