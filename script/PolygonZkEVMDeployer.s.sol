// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMDeployerDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMDeployerDeployer {
    function run() public {
        address _owner = address(1);
        deployPolygonZkEVMDeployerImplementation(_owner);
    }
}
