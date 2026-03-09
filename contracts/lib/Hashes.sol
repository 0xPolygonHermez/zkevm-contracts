// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/cryptography/Hashes.sol)

pragma solidity ^0.8.20;

/**
 * @dev Library of standard hash functions.
 * @notice This code is a copy from OpenZeppelin Contracts v5.1.0 (utils/cryptography/Hashes.sol) with a minor change:
 *         function visibility is modified from 'private' to 'internal' so it can be used in other contracts.
 * @notice OpenZeppelin already did this change: https://github.com/OpenZeppelin/openzeppelin-contracts/commit/441dc141ac99622de7e535fa75dfc74af939019c
 *         to be included in next version of OpenZeppelin Contracts.
 * _Available since v5.1._
 */
library Hashes {
    /**
     * @dev Implementation of keccak256(abi.encode(a, b)) that doesn't allocate or expand memory.
     */
    function efficientKeccak256(
        bytes32 a,
        bytes32 b
    ) internal pure returns (bytes32 value) {
        assembly ("memory-safe") {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }
}
