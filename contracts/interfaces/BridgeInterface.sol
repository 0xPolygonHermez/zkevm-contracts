// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

interface BridgeInterface {
    function currentGlobalExitRoot() external view returns (bytes32);

    function updateRollupExitRoot(bytes32 newRollupExitRoot) external;
}
