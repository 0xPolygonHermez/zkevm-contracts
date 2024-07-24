// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMDeployerDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMDeployerDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");
        address _owner = makeAddr("Owner");
        deployPolygonZkEVMDeployerTransparent(proxyAdminOwner, _owner);
    }
}