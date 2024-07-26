// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/FflonkVerifierDeployer.s.sol";

contract Deploy is Script, FflonkVerifierDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        (
            address implementation,
            address proxyAdmin,
            address proxy
        ) = deployFflonkVerifierTransparent(proxyAdminOwner);

        console.log("FflonkVerifier deployed at: ", proxy);
        console.log(
            "FflonkVerifier implementation deployed at: ",
            implementation
        );
        console.log("FflonkVerifier proxy admin: ", proxyAdmin);
    }
}
