// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/ClaimCompressorDeployer.s.sol";

contract Deploy is Script, ClaimCompressorDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        address _bridgeAddress = makeAddr("bridgeAddress");
        uint32 _networkID = 1;

        deployClaimCompressorTransparent(
            proxyAdminOwner,
            _bridgeAddress,
            _networkID
        );
    }
}
