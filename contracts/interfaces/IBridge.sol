// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

/**
 * @dev Define interface verifier
 */
interface IBridge {
    function pushCurrentRoot() external;
}
