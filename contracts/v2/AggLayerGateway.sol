// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ISP1Verifier} from "./interfaces/ISP1Verifier.sol";
import {IAggLayerGateway} from "./interfaces/IAggLayerGateway.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable5/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable5/access/AccessControlUpgradeable.sol";

// Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol

/**
 * @title AggLayerGateway
 * @notice Contract to handle the verification keys for the pessimistic proof.
 * It supports adding and freezing PP verification keys and verifying the PP.
 * Also maintains the default verification keys of aggchains
 */
contract AggLayerGateway is
    Initializable,
    AccessControlUpgradeable,
    IAggLayerGateway
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

    ////////////////////////////////////////////////////////////
    //                       Mappings                         //
    ////////////////////////////////////////////////////////////
    // Mapping with the default aggchain verification keys
    mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey)
        public defaultAggchainVKeys;

    // Mapping with the pessimistic verification key routes
    mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute)
        public pessimisticVKeyRoutes;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private __gap;

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
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////
    /**
     * @notice  Initializer function to set new rollup manager version.
     * @param defaultAdmin The address of the default admin. Can grant role to addresses.
     * @dev This address is the highest privileged address so it's recommended to use a timelock
     * @param aggchainDefaultVKeyRole The address that can manage the aggchain verification keys.
     * @param addRouteRole The address that can add a route to a pessimistic verification key.
     * @param freezeRouteRole The address that can freeze a route to a pessimistic verification key.
     * @param pessimisticVKeySelector The 4 bytes selector to add to the pessimistic verification keys.
     * @param verifier The address of the verifier contract.
     * @param pessimisticVKey New pessimistic program verification key.
     */
    function initialize(
        address defaultAdmin,
        address aggchainDefaultVKeyRole,
        address addRouteRole,
        address freezeRouteRole,
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) external initializer {
        if (
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

        _addPessimisticVKeyRoute(
            pessimisticVKeySelector,
            verifier,
            pessimisticVKey
        );
    }

    ////////////////////////////////////////////////////////////
    //        Functions: AggLayerGateway (pessimistic)        //
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
     * @dev First 2 bytes are the aggchain type, the last 2 bytes are the 'verification key identifier'.
     */
    function getDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external view returns (bytes32) {
        if (defaultAggchainVKeys[defaultAggchainSelector] == bytes32(0)) {
            revert AggchainVKeyNotFound();
        }

        return defaultAggchainVKeys[defaultAggchainSelector];
    }
}
