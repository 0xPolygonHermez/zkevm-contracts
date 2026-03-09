// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseLegacyAgglayerGER.sol";

/**
 * @title IAgglayerGERL2
 * @notice Interface for the AgglayerGERL2 contract that manages global exit roots on L2
 */
interface IAgglayerGERL2 is IBaseLegacyAgglayerGER {
    // Functions

    /**
     * @notice Insert a new global exit root
     * @dev After inserting the new global exit root, the hash chain value is updated.
     *      A hash chain is being used to make optimized proof generations of GERs.
     *      Can only be called by the globalExitRootUpdater
     * @param _newRoot new global exit root to insert
     */
    function insertGlobalExitRoot(bytes32 _newRoot) external;

    /**
     * @notice Starts the globalExitRootUpdater role transfer
     * @dev This is a two step process, the pending globalExitRootUpdater must accept to finalize the process
     *      Can only be called by the current globalExitRootUpdater
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external;

    /**
     * @notice Allow the current pending globalExitRootUpdater to accept the globalExitRootUpdater role
     * @dev Can only be called by the pendingGlobalExitRootUpdater
     */
    function acceptGlobalExitRootUpdater() external;

    // State variable getters

    /**
     * @notice Get the globalExitRootRemover address
     * @dev This variable is exposed to be used by a BridgeL2Sovereign modifier
     * @return The address of the globalExitRootRemover
     */
    function globalExitRootRemover() external view returns (address);

    /**
     * @notice Get the globalExitRootUpdater address
     * @return The address of the globalExitRootUpdater
     */
    function globalExitRootUpdater() external view returns (address);

    /**
     * @notice Get the pending globalExitRootUpdater address
     * @return The address of the pending globalExitRootUpdater
     */
    function pendingGlobalExitRootUpdater() external view returns (address);

    /**
     * @notice Get the value of the global exit roots hash chain after last insertion
     * @return The current hash chain value
     */
    function insertedGERHashChain() external view returns (bytes32);
}
