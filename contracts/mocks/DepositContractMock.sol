// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../lib/DepositContract.sol";
import "hardhat/console.sol";

/**
 * This contract will be used as a herlper for all the sparse merkle tree related functions
 * Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol
 */
contract DepositContractMock is DepositContract {
    constructor() {
        initialize();
    }

    function initialize() public initializer {}

    /**
     * @notice Given the leaf data returns the leaf value
     * @param leafType Leaf type
     * @param originNetwork Origin Network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount Amount of tokens
     * @param metadataHash Hash of the metadata
     */
    function deposit(
        uint8 leafType,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) public {
        _deposit(
            getLeafValue(
                leafType,
                originNetwork,
                originTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash
            )
        );
    }
}
