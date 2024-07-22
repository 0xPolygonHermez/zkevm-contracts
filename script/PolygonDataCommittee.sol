// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonDataCommitteeDeployer.s.sol";

contract Deploy is Script, PolygonDataCommitteeDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        deployPolygonDataCommitteeTransparent(proxyAdminOwner);
    }
}
