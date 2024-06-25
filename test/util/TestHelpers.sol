// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";

abstract contract TestHelpers is Test {
    Account internal DEPLOYER;

    constructor() {
        DEPLOYER = makeAccount("DEPLOYER");
        vm.setEnv("PRIVATE_KEY", vm.toString(DEPLOYER.key));
    }
}
