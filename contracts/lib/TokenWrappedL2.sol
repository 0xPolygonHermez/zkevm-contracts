// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TokenWrappedL2 is ERC20 {
    address public bridgeAddress;

    modifier onlyBridge() {
        require(msg.sender == bridgeAddress, "ERC20:NOT_BRIDGE");
        _;
    }

    constructor(
        string memory name,
        string memory symbol,
        address initialAccount,
        uint256 initialBalance
    ) payable ERC20(name, symbol) {
        bridgeAddress = msg.sender;
        _mint(initialAccount, initialBalance);
    }

    function mint(address to, uint256 value)
        external
        onlyBridge
        returns (bool)
    {
        _mint(to, value);
        return true;
    }

    function burn(address account, uint256 value)
        external
        onlyBridge
        returns (bool)
    {
        _burn(account, value);
        return true;
    }
}
