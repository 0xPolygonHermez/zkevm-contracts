// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonRollupManagerEmptyMockDeployer.s.sol";

contract Deploy is Script, PolygonRollupManagerEmptyMockDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployPolygonRollupManagerEmptyMockTransparent(proxyAdminOwner);
        console.log("PolygonRollupManagerEmptyMock deployed at: ", proxy);
        console.log(
            "PolygonRollupManagerEmptyMock implementation deployed at: ",
            implementation
        );
        console.log("PolygonRollupManagerEmptyMock proxy admin: ", proxyAdmin);
    }
}
