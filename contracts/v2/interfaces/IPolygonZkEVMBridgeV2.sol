// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IPolygonZkEVMBaseBridge.sol";

interface IPolygonZkEVMBridgeV2 is IPolygonZkEVMBaseBridge {
    /**
     * @dev Thrown when sender is not the rollup manager
     */
    error OnlyRollupManager();

    function activateEmergencyState() external;

    function deactivateEmergencyState() external;
}
