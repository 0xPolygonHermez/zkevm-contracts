// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMBridgeV2Deployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");
        uint32 _networkID = 0;
        address _gasTokenAddress = makeAddr("gasTokenAddress");
        uint32 _gasTokenNetwork = 1;
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager = IBasePolygonZkEVMGlobalExitRoot(
                makeAddr("PolygonZkEVMGlobalExitRootV2")
            );

        address _rollupManager = makeAddr("RollupManager");
        bytes memory _gasTokenMetadata = bytes("");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployPolygonZkEVMBridgeV2Transparent(
                proxyAdminOwner,
                _networkID,
                _gasTokenAddress,
                _gasTokenNetwork,
                _globalExitRootManager,
                _rollupManager,
                _gasTokenMetadata
            );
        console.log("PolygonZkEVMBridgeV2 deployed at: ", proxy);
        console.log(
            "PolygonZkEVMBridgeV2 implementation deployed at: ",
            implementation
        );
        console.log("PolygonZkEVMBridgeV2 proxy admin: ", proxyAdmin);
    }
}
