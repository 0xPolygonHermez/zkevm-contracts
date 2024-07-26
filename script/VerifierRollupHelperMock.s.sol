// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/VerifierRollupHelperMockDeployer.s.sol";

contract Deploy is Script, VerifierRollupHelperMockDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployVerifierRollupHelperMockTransparent(proxyAdminOwner);
        console.log("VerifierRollupHelperMock deployed at: ", proxy);
        console.log(
            "VerifierRollupHelperMock implementation deployed at: ",
            implementation
        );
        console.log("VerifierRollupHelperMock proxy admin: ", proxyAdmin);
    }
}
