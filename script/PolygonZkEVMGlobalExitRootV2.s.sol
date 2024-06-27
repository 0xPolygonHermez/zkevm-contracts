// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMGlobalExitRootV2Deployer {
    function run() public {
        address _rollupManager = makeAddr("RollupManager");
        address _bridgeAddress = makeAddr("PolygonZkEVMBridgeV2");
        deployPolygonZkEVMGlobalExitRootV2Implementation(
            _rollupManager,
            _bridgeAddress
        );
    }
}
