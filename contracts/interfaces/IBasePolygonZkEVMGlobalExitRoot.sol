// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IBasePolygonZkEVMGlobalExitRoot {
    /**
     * @dev Thrown when the caller is not the allowed contracts
     */
    error OnlyAllowedContracts();

    /**
     * @dev Thrown when the caller is not the coinbase neither the globalExitRootUpdater
     */
    error OnlyGlobalExitRootUpdater();

    /**
     * @dev Thrown when trying to call a function that only the pending GlobalExitRootUpdater can call.
     */
    error OnlyPendingGlobalExitRootUpdater();

    /**
     * @dev Thrown when the caller is not the globalExitRootRemover
     */
    error OnlyGlobalExitRootRemover();

    /**
     * @dev Thrown when trying to call a function that only the pending GlobalExitRootRemover can call.
     */
    error OnlyPendingGlobalExitRootRemover();

    /**
     * @dev Thrown when trying to insert a global exit root that is already set
     */
    error GlobalExitRootAlreadySet();

    /**
     * @dev Thrown when trying to remove a ger that doesn't exist
     */
    error GlobalExitRootNotFound();

    /**
     * @dev Thrown when trying to call a function with an input zero address
     */
    error InvalidZeroAddress();

    function updateExitRoot(bytes32 newRollupExitRoot) external;

    function globalExitRootMap(
        bytes32 globalExitRootNum
    ) external returns (uint256);
}
