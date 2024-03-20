// SPDX-License-Identifier: GPL-3.0
// Custom Wrapper Example
pragma solidity 0.8.20;

import "../../mocks/ERC20PermitMock.sol";

contract ERC20ExistingMock is ERC20PermitMock("ERC20", "ER20", address(6), 0) {
    function burn(address account, uint256 value) public {
        _burn(account, value);
    }
}

/**
 * @title CustomTokenWrapperMock
 * @notice Example of custom wrapper.
 *         mint and burn function can be complex but this mock
 *         only basic functionality
 */
contract CustomTokenWrapperMock {
    ERC20ExistingMock token;

    constructor(address _token) {
        token = ERC20ExistingMock(_token);
    }

    function mint(address to, uint256 value) external {
        token.mint(to, value);
    }

    function burn(address account, uint256 value) external {
        token.burn(account, value);
    }
}
