// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/ERC20PermitMockDeployer.s.sol";

contract Deploy is Script, ERC20PermitMockDeployer {
    function run() public {
        address proxyAdminOwner = makeAddr("proxyAdminOwner");

        string memory _name = "POL Token";
        string memory _symbol = "POL";
        address _initialAccount = makeAddr("initialAccount");
        uint256 _initialBalance = 20_000_000;

        deployERC20PermitMockTransparent(
            proxyAdminOwner,
            _name,
            _symbol,
            _initialAccount,
            _initialBalance
        );
    }
}
