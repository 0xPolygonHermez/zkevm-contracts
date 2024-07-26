// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMGlobalExitRootV2Deployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");
        address _rollupManager = makeAddr("RollupManager");
        address _bridgeAddress = makeAddr("PolygonZkEVMBridgeV2");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployPolygonZkEVMGlobalExitRootV2Transparent(
                proxyAdminOwner,
                _rollupManager,
                _bridgeAddress
            );
        console.log("PolygonZkEVMGlobalExitRootV2 deployed at: ", proxy);
        console.log(
            "PolygonZkEVMGlobalExitRootV2 implementation deployed at: ",
            implementation
        );
        console.log("PolygonZkEVMGlobalExitRootV2 proxy admin: ", proxyAdmin);
    }
}
