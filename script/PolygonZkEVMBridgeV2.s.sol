// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";

contract Deploy is Script, PolygonZkEVMBridgeV2Deployer {
    function run() public {
        deployPolygonZkEVMBridgeV2Implementation();
    }
}
