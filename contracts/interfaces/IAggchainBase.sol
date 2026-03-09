// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./IAggchainSigners.sol";

/**
 * @title IAggchainBaseEvents
 * @notice Events emitted by AggchainBase implementations
 */
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
     * @notice Emitted when the admin set the flag useDefaultVkeys to true.
     */
    event EnableUseDefaultVkeysFlag();

    /**
     * @notice Emitted when the admin set the flag useDefaultVkeys to false.
     */
    event DisableUseDefaultVkeysFlag();

    /**
     * @notice Emitted when the admin set the flag useDefaultSigners to true.
     */
    event EnableUseDefaultSignersFlag();

    /**
     * @notice Emitted when the admin set the flag useDefaultSigners to false.
     */
    event DisableUseDefaultSignersFlag();

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

    /**
     * @notice Emitted when metadata is set or updated.
     * @param key The metadata key.
     * @param value The metadata value.
     */
    event AggchainMetadataSet(string indexed key, string value);

    /**
     * @notice Emitted when the aggchain metadata manager is set.
     * @param oldAggchainMetadataManager The old aggchain metadata manager.
     * @param newAggchainMetadataManager The new aggchain metadata manager.
     */
    event SetAggchainMetadataManager(
        address oldAggchainMetadataManager,
        address newAggchainMetadataManager
    );
}

/**
 * @title IAggchainBaseErrors
 * @notice Error definitions for AggchainBase implementations
 */
interface IAggchainBaseErrors {
    /// @notice Thrown when trying to add zero value verification key.
    error ZeroValueAggchainVKey();
    /// @notice Thrown when trying to add an aggchain verification key that already exists.
    error OwnedAggchainVKeyAlreadyAdded();
    /// @notice Thrown when trying to retrieve an aggchain verification key that does not exist.
    error OwnedAggchainVKeyNotFound();
    /// @notice Thrown when trying to initialize the incorrect initialize function.
    error InvalidInitializeFunction();
    /// @notice Thrown when trying to enable the default vkeys when it is already enabled.
    error UseDefaultVkeysAlreadyEnabled();
    /// @notice Thrown when trying to disable the default vkeys when it is already disabled.
    error UseDefaultVkeysAlreadyDisabled();
    /// @notice Thrown when trying to enable the default signers when it is already enabled.
    error UseDefaultSignersAlreadyEnabled();
    /// @notice Thrown when trying to disable the default signers when it is already disabled.
    error UseDefaultSignersAlreadyDisabled();
    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists.
    error AggchainVKeyNotFound();
    /// @notice Thrown when trying to set the aggchain manager to zero address.
    error AggchainManagerCannotBeZero();
    /// @notice Thrown when the aggchain manager is already initialized.
    error AggchainManagerAlreadyInitialized();
    /// @notice Thrown when an invalid initial aggchain vkey is provided.
    error InvalidInitAggchainVKey();
    /// @notice Thrown when trying to use default signers but also providing signers to add
    error ConflictingDefaultSignersConfiguration();
    /// @notice Thrown when the caller is not the aggchain manager
    error OnlyAggchainManager();
    /// @notice Thrown when the caller is not the pending aggchain manager
    error OnlyPendingAggchainManager();
    /// @notice Thrown when trying to call a function with an input zero address
    error InvalidZeroAddress();
    /// @notice Thrown when the aggchainData has an invalid format
    error InvalidAggchainDataLength();
    /// @notice Thrown when the aggchainvKeySelector contains an invalid aggchain type.
    error InvalidAggchainType();
    /// @notice Thrown when threshold is zero, greater than the number of aggchainSigners.
    error InvalidThreshold();
    /// @notice Thrown when trying to add a signer that already exists.
    error SignerAlreadyExists();
    /// @notice Thrown when trying to remove a signer that doesn't exist.
    error SignerDoesNotExist();
    /// @notice Thrown when trying to add a zero address as a signer.
    error SignerCannotBeZero();
    /// @notice Thrown when the aggchainSingers is greater than 255.
    error AggchainSignersTooHigh();
    /// @notice Thrown when trying to add a signer with an empty URL.
    error SignerURLCannotBeEmpty();
    /// @notice Thrown when the indices for signer removal are not in descending order.
    error IndicesNotInDescendingOrder();
    /// @notice Thrown when trying to compute the aggchain hash without initializing the signers hash.
    error AggchainSignersHashNotInitialized();
    /// @notice Thrown when the keys and values arrays have different lengths in batch metadata operations.
    error MetadataArrayLengthMismatch();
    /// @notice Thrown when the caller is not the aggchain metadata manager
    error OnlyAggchainMetadataManager();
}

/**
 * @title IAggchainBase
 * @notice Core interface for aggchain implementations
 * @dev All aggchain contracts must implement these functions for integration with the rollup manager.
 *      Different implementations (FEP, ECDSA) may handle these functions differently based on their consensus mechanism.
 */
interface IAggchainBase is
    IAggchainBaseErrors,
    IAggchainBaseEvents,
    IAggchainSigners
{
    /**
     * @notice Gets aggchain hash for consensus verification
     * @dev Each implementation computes this hash differently based on its consensus mechanism.
     *      The hash is used by the rollup manager to verify state transitions.
     * @param aggchainData Custom chain data to build the consensus hash
     * @return The computed aggchain hash for verification
     */
    function getAggchainHash(
        bytes calldata aggchainData
    ) external view returns (bytes32);

    /**
     * @notice Callback from the AgglayerManager after successful pessimistic proof verification
     * @dev Each implementation handles state updates differently
     * @param aggchainData Custom chain data containing state update information
     */
    function onVerifyPessimistic(bytes calldata aggchainData) external;

    /**
     * @notice Sets the initial aggchain manager during contract deployment
     * @dev Can only be called once by the rollup manager during initialization.
     *      The aggchain manager has privileged access to modify consensus parameters.
     * @param newAggchainManager The address of the new aggchain manager
     */
    function initAggchainManager(address newAggchainManager) external;

    /// @notice Returns the unique aggchain type identifier.
    function AGGCHAIN_TYPE() external view returns (bytes2);

    /**
     * @notice Returns the current aggchain manager address
     * @dev The aggchain manager has administrative privileges over consensus parameters
     * @return The address of the current aggchain manager
     */
    function aggchainManager() external view returns (address);
}
