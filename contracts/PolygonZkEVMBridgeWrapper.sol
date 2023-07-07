// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "./inheritedMainContracts/PolygonZkEVMBridge.sol";

contract PolygonZkEVMBridgeWrapper is PolygonZkEVMBridge{
    function initialize(
        uint32 _networkID,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonZkEVMaddress,
        address _gasTokenAddress,
        bool _isDeployedOnL2
    ) public virtual override initializer {
        PolygonZkEVMBridge.initialize(_networkID, _globalExitRootManager, _polygonZkEVMaddress, _gasTokenAddress, _isDeployedOnL2);
    }
}