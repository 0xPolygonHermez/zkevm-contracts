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
    error OnlyAggOracleOrCoinbase();

    /**
     * @dev Thrown when trying to insert a global exit root that is already set
     */
    error GlobalExitRootAlreadySet();

    /**
     * @dev Thrown when trying to remove more global exit roots thank inserted
     */
    error NotEnoughGlobalExitRootsInserted();

    /**
     * @dev Thrown when trying to remove a ger that is not the last one
     */
    error NotLastInsertedGlobalExitRoot();

    function updateExitRoot(bytes32 newRollupExitRoot) external;

    function globalExitRootMap(
        bytes32 globalExitRootNum
    ) external returns (uint256);
}
