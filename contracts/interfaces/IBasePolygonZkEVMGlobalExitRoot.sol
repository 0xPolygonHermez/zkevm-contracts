// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IBasePolygonZkEVMGlobalExitRoot {
    /**
     * @dev Thrown when the caller is not the allowed contracts
     */
    error OnlyAllowedContracts();

    /**
     * @dev Thrown when the caller is not the coinbase
     */
    error OnlyCoinbase();

    /**
     * @dev Thrown when trying to insert a global exit root that is already set
     */
    error GlobalExitRootAlreadySet();

    /**
     * @dev Thrown when trying to remove a global exit root that is not found
     */
    error GlobalExitRootNotFound();

    function updateExitRoot(bytes32 newRollupExitRoot) external;

    function globalExitRootMap(
        bytes32 globalExitRootNum
    ) external returns (uint256);
}
