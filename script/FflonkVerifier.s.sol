// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/FflonkVerifierDeployer.s.sol";

contract Deploy is Script, FflonkVerifierDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        deployFflonkVerifierTransparent(proxyAdminOwner);
    }
}
