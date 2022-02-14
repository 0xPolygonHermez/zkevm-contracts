// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

interface IGlobalExitRootManager {
    function getLastGlobalExitRoot() external view returns (bytes32);

    function updateExitRoot(bytes32 newRollupExitRoot) external;

    function globalExitRootMap(uint256 globalExitRootNum)
        external
        returns (bytes32);
}
