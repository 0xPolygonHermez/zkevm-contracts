// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IAggchainBaseEvents {
    /**
     * @notice Emitted when the admin adds an aggchain verification key.
     * @param selector The selector of the verification key to add.
     * @param newAggchainVKey The new aggchain verification key.
     */
    event AddAggchainVKey(bytes4 selector, bytes32 newAggchainVKey);
    /**
     * @notice Emitted when the admin updates the aggchain verification key.
     * @param selector The selector of the verification key to update.
     * @param previousAggchainVKey The previous aggchain verification key.
     * @param newAggchainVKey The new new aggchain verification key.
     */
    event UpdateAggchainVKey(
        bytes4 selector,
        bytes32 previousAggchainVKey,
        bytes32 newAggchainVKey
    );
    /**
     * @notice Emitted when the admin set the flag useDefaultGateway to true.
     */
    event EnableUseDefaultGatewayFlag();

    /**
     * @notice Emitted when the admin set the flag useDefaultGateway to false.
     */
    event DisableUseDefaultGatewayFlag();

    /**
     * @notice Emitted when the vKeyManager starts the two-step transfer role setting a new pending vKeyManager.
     * @param currentVKeyManager The current vKeyManager.
     * @param newPendingVKeyManager The new pending vKeyManager.
     */
    event TransferVKeyManagerRole(
        address currentVKeyManager,
        address newPendingVKeyManager
    );

    /**
     * @notice Emitted when the pending vKeyManager accepts the vKeyManager role.
     * @param oldVKeyManager The previous vKeyManager.
     * @param newVKeyManager The new vKeyManager.
     */
    event AcceptVKeyManagerRole(address oldVKeyManager, address newVKeyManager);

    /// @dev Emitted when the aggchainManager starts the two-step transfer role setting a new pending newAggchainManager
    /// @param currentAggchainManager The current pending aggchainManager
    /// @param newPendingAggchainManager The new pending aggchainManager
    event TransferAggchainManagerRole(
        address currentAggchainManager,
        address newPendingAggchainManager
    );

    /// @notice Emitted when the pending aggchainManager accepts the aggchainManager role
    /// @param oldAggchainManager The old aggchainManager
    /// @param newAggchainManager The new aggchainManager
    event AcceptAggchainManagerRole(
        address oldAggchainManager,
        address newAggchainManager
    );
}

interface IAggchainBaseErrors {
    /// @notice Thrown when trying to add zero value verification key.
    error ZeroValueAggchainVKey();
    /// @notice Thrown when trying to add an aggchain verification key that already exists.
    error OwnedAggchainVKeyAlreadyAdded();
    /// @notice Thrown when trying to retrieve an aggchain verification key that does not exist.
    error OwnedAggchainVKeyNotFound();
    /// @notice Thrown when trying to initialize the incorrect initialize function.
    error InvalidInitializeFunction();
    /// @notice Thrown when trying to enable the default gateway when it is already enabled.
    error UseDefaultGatewayAlreadyEnabled();
    /// @notice Thrown when trying to disable the default gateway when it is already disabled.
    error UseDefaultGatewayAlreadyDisabled();
    /// @notice Thrown when trying to call a function that only the VKeyManager can call.
    error OnlyVKeyManager();
    /// @notice Thrown when trying to call a function that only the pending VKeyManager can call.
    error OnlyPendingVKeyManager();
    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.
    error AggchainVKeyNotFound();
    /// @notice Thrown when trying to deploy the aggchain with a zero address as the AggLayerGateway
    error InvalidAggLayerGatewayAddress();
    /// @notice Thrown when trying to set the aggchain manager to zero address.
    error AggchainManagerCannotBeZero();
    /// @notice Thrown when the caller is not the aggchain manager
    error OnlyAggchainManager();
    /// @notice Thrown when the caller is not the pending aggchain manager
    error OnlyPendingAggchainManager();
    /// @notice Thrown when trying to call a function with an input zero address
    error InvalidZeroAddress();
    /// @notice Thrown when the aggchainData has an invalid format
    error InvalidAggchainDataLength();
    /// @notice Thrown when the aggchainvKeySelectir contains an invalid aggchain type.
    error InvalidAggchainType();
}

/**
 * @title IAggchainBase
 * @notice Shared interface for native aggchain implementations.
 */
interface IAggchainBase is IAggchainBaseErrors, IAggchainBaseEvents {
    /**
     * @notice Gets aggchain hash.
     * @dev Each chain should properly manage its own aggchain hash.
     * @param aggchainData Custom chain data to build the consensus hash.
     */
    function getAggchainHash(
        bytes calldata aggchainData
    ) external view returns (bytes32);

    /**
     * @notice Callback from the PolygonRollupManager to update the chain's state.
     * @dev Each chain should properly manage its own state.
     * @param aggchainData Custom chain data to update chain's state
     */
    function onVerifyPessimistic(bytes calldata aggchainData) external;

    /**
     * @notice Sets the aggchain manager.
     * @param newAggchainManager The address of the new aggchain manager.
     */
    function initAggchainManager(address newAggchainManager) external;

    /// @notice Returns the unique aggchain type identifier.
    function AGGCHAIN_TYPE() external view returns (bytes2);
}
