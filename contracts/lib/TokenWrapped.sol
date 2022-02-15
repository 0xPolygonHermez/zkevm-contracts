// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract TokenWrapped is Initializable, ERC20Upgradeable {
    address public bridgeAddress;
    uint8 private _decimals;

    modifier onlyBridge() {
        require(msg.sender == bridgeAddress, "TokenWrapped:NOT_BRIDGE");
        _;
    }

    // This is used to avoid the initialization of the implementation contract.
    constructor() initializer {}

    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address initialAccount,
        uint256 initialBalance
    ) public initializer {
        __ERC20_init(name, symbol);
        bridgeAddress = msg.sender;
        _decimals = decimals;
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

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
