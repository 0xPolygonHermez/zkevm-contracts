// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IALCB is IERC20 {
    function destroyTokens(uint256 amount) external;
}
