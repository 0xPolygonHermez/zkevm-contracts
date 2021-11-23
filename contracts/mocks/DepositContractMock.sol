// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;
import "../lib/DepositContract.sol";
import "hardhat/console.sol";

/**
 * This contract will be used as a herlper for all the sparse merkle tree related functions
 * Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol
 */
contract DepositContractMock is DepositContract {
    /**
     * @notice Add a new leaf to the merkle tree
     * @param token Token address, 0 address is reserved for ehter
     * @param amount Amount of tokens
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     */
    function deposit(
        address token,
        uint256 amount,
        uint32 destinationNetwork,
        address destinationAddress
    ) public {
        _deposit(token, amount, destinationNetwork, destinationAddress);
    }
}
