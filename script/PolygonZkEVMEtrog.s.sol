// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMEtrogDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMEtrogDeployer {
    function run() public {
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager = IPolygonZkEVMGlobalExitRootV2(
                makeAddr("PolygonZkEVMGlobalExitRootV2")
            );
        IERC20Upgradeable _pol = IERC20Upgradeable(makeAddr("POL"));
        IPolygonZkEVMBridgeV2 _bridgeAddress = IPolygonZkEVMBridgeV2(
            makeAddr("PolygonZkEVMBridgeV2")
        );
        PolygonRollupManager _rollupManager = PolygonRollupManager(
            makeAddr("RollupManager")
        );
        deployPolygonZkEVMEtrogImplementation(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        );
    }
}
