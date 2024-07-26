// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonDataCommitteeDeployer.s.sol";

contract Deploy is Script, PolygonDataCommitteeDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployPolygonDataCommitteeTransparent(proxyAdminOwner);
        console.log("PolygonDataCommittee deployed at: ", proxy);
        console.log(
            "PolygonDataCommittee implementation deployed at: ",
            implementation
        );
        console.log("PolygonDataCommittee proxy admin: ", proxyAdmin);
    }
}
