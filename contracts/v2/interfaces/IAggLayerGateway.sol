// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// based on: https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol

interface IAggLayerGatewayEvents {
    /// @notice Emitted when a verifier route is added.
    /// @param selector The verifier selector that was added.
    /// @param verifier The address of the verifier contract.
    /// @param pessimisticVKey The verification key
    event RouteAdded(
        bytes4 selector,
        address verifier,
        bytes32 pessimisticVKey
    );

    /// @notice Emitted when a verifier route is frozen.
    /// @param selector The verifier selector that was frozen.
    /// @param verifier The address of the verifier contract.
    event RouteFrozen(
        bytes4 selector,
        address verifier,
        bytes32 pessimisticVKey
    );

    /**
     * Emitted when a new default aggchain verification key is added
     * @param selector The 4 bytes selector of the added default aggchain verification key.
     * @param newVKey New aggchain verification key to be added
     */
    event AddDefaultAggchainVKey(bytes4 selector, bytes32 newVKey);

    /**
     * Emitted when a default aggchain verification key is update
     * @param selector The 4 bytes selector of the updated default aggchain verification key.
     * @param previousVKey Aggchain verification key previous value
     * @param newVKey Aggchain verification key updated value
     */
    event UpdateDefaultAggchainVKey(
        bytes4 selector,
        bytes32 previousVKey,
        bytes32 newVKey
    );

    /**
     * Emitted when a default aggchain verification key is set to zero
     * @param selector The 4 bytes selector of the updated default aggchain verification key.
     */
    event UnsetDefaultAggchainVKey(bytes4 selector);
}

/// @dev Extended error events from https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface IAggLayerGatewayErrors {
    /// @notice Thrown when the verifier route is not found.
    /// @param selector The verifier selector that was specified.
    error RouteNotFound(bytes4 selector);

    /// @notice Thrown when the verifier route is found, but is frozen.
    /// @param selector The verifier selector that was specified.
    error RouteIsFrozen(bytes4 selector);

    /// @notice Thrown when trying to freeze a route that is already frozen.
    /// @param selector The pessimistic verification key selector that was specified.
    error RouteIsAlreadyFrozen(bytes4 selector);

    /// @notice Thrown when adding a verifier route and the selector already contains a route.
    /// @param selector The pessimistic verification key selector that was specified.
    /// @param verifier The address of the verifier contract in the existing route.
    error RouteAlreadyExists(bytes4 selector, address verifier);

    /// @notice Thrown when adding a verifier route and the selector returned by the verifier is
    /// zero.
    error PPSelectorCannotBeZero();

    /// @notice Thrown when adding a verifier key with value zero
    error VKeyCannotBeZero();

    /// @notice Thrown when the caller is not the AggLayerAdmin
    error OnlyAggLayerAdmin();

    //// @notice Thrown when the caller is not the pending AggLayerAdmin
    error OnlyPendingAggLayerAdmin();

    /// @notice Thrown when trying to add an aggchain verification key that already exists
    error AggchainVKeyAlreadyExists();

    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists
    error AggchainVKeyNotFound();

    /// @notice Thrown when trying to call a function with an input zero address
    error InvalidZeroAddress();

    /// @notice Thrown when the input proof bytes are invalid.
    error InvalidProofBytesLength();
}

/// @title IAggLayerGateway
/// @notice This contract is the interface for the AggLayerGateway.
/// @notice Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface IAggLayerGateway is IAggLayerGatewayEvents, IAggLayerGatewayErrors {
    /**
     * Struct that defines a verifier route
     * @param verifier The address of the verifier contract.
     * @param pessimisticVKey The verification key to be used for verifying pessimistic proofs.
     * @param frozen Whether the route is frozen.
     */
    struct AggLayerVerifierRoute {
        address verifier; // SP1 Verifier. It contains sanity check SP1 version with the 4 first bytes of the proof. proof[4:]
        bytes32 pessimisticVKey;
        bool frozen;
    }

    /**
     * @notice returns the current aggchain verification key, used to verify chain's FEP.
     * @dev This function is necessary to query the map from an external function. In solidity maps are not
     * directly accessible from external functions like other state variables.
     */
    function getDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external view returns (bytes32);

    /// @notice Verifies a pessimistic proof with given public values and proof.
    /// @dev It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
    /// target verifier's VERIFIER_HASH.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;

    /// @notice Adds a verifier route. This enable proofs to be routed to this verifier.
    /// @dev Only callable by the owner. The owner is responsible for ensuring that the specified
    /// verifier is correct with a valid VERIFIER_HASH. Once a route to a verifier is added, it
    /// cannot be removed.
    /// @param pessimisticVKeySelector The verifier selector to add.
    /// @param verifier The address of the verifier contract. This verifier MUST implement the
    /// ISP1VerifierWithHash interface.
    /// @param pessimisticVKey The verification key to be used for verifying pessimistic proofs.
    function addPessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) external;

    /// @notice Freezes a verifier route. This prevents proofs from being routed to this verifier.
    /// @dev Only callable by the owner. Once a route to a verifier is frozen, it cannot be
    /// unfrozen.
    /// @param pessimisticVKeySelector The verifier selector to freeze.
    function freezePessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector
    ) external;
}
