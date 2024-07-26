// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

////////////////////////////////////////////////////
// AUTOGENERATED - DO NOT EDIT THIS FILE DIRECTLY //
////////////////////////////////////////////////////

import "forge-std/Script.sol";

import {ClaimCompressor} from "contracts/utils/ClaimCompressor.sol";

abstract contract ClaimCompressorDeployer is Script {
    function deployClaimCompressorImplementation(
        address __bridgeAddress,
        uint32 __networkID
    ) internal returns (address implementation) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        implementation = address(
            new ClaimCompressor(__bridgeAddress, __networkID)
        );
        vm.stopBroadcast();
    }
}
