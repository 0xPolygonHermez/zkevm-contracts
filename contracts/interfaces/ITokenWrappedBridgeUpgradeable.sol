// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ITokenWrappedBridgeUpgradeable is
    IERC20,
    IERC20Metadata,
    IERC20Permit
{
    function initialize(
        string memory name,
        string memory symbol,
        uint8 __decimals
    ) external;

    function mint(address to, uint256 value) external;
    function burn(address account, uint256 value) external;
}
