// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonRollupManagerDeployer.s.sol";

contract Deploy is Script, PolygonRollupManagerDeployer {
    function run() public {
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager = IPolygonZkEVMGlobalExitRootV2(
                makeAddr("PolygonZkEVMGlobalExitRootV2")
            );
        IERC20Upgradeable _pol = IERC20Upgradeable(makeAddr("POL"));
        IPolygonZkEVMBridge _bridgeAddress = IPolygonZkEVMBridge(
            makeAddr("PolygonZkEVMBridge")
        );
        address implementation = deployPolygonRollupManagerImplementation(
            _globalExitRootManager,
            _pol,
            _bridgeAddress
        );
        console.log("PolygonRollupManager deployed at: ", implementation);
    }
}
