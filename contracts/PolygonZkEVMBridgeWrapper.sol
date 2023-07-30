// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "./inheritedMainContracts/PolygonZkEVMBridge.sol";

contract PolygonZkEVMBridgeWrapper is PolygonZkEVMBridge{
    function initialize(
        uint32 _networkID,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonZkEVMaddress,
        address _gasTokenAddress,
        bool _isDeployedOnL2,
        uint32 _lastUpdatedDepositCount,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] memory depositBranches
    ) public virtual override initializer {
        PolygonZkEVMBridge.initialize(_networkID, _globalExitRootManager, _polygonZkEVMaddress, _gasTokenAddress, _isDeployedOnL2, _lastUpdatedDepositCount, depositBranches);
    }
}