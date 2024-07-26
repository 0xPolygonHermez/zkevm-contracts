// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMTimelockDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMTimelockDeployer {
    function run() public {
        uint256 minDelay = 0;
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](0);
        address admin = makeAddr("admin");
        PolygonZkEVM _polygonZkEVM = PolygonZkEVM(makeAddr("polygonZkEVM"));

        address implementation = deployPolygonZkEVMTimelockImplementation(
            minDelay,
            proposers,
            executors,
            admin,
            _polygonZkEVM
        );
        console.log("PolygonZkEVMTimelock deployed at: ", implementation);
    }
}
