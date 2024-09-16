// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./DepositContractBase.sol";

/**
 * This contract will be used in the PolygonZkEVMBridge contract, it inherits the DepositContractBase and adds the logic
 * to calculate the leaf of the tree
 */
contract DepositContractV2 is ReentrancyGuardUpgradeable, DepositContractBase {
    /**
     * @notice Given the leaf data returns the leaf value
     * @param leafType Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message
     * @param originNetwork Origin Network
     * @param originAddress [0] Origin token address, 0 address is reserved for ether, [1] msg.sender of the message
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount [0] Amount of tokens/ether, [1] Amount of ether
     * @param metadataHash Hash of the metadata
     */
    function getLeafValue(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    leafType,
                    originNetwork,
                    originAddress,
                    destinationNetwork,
                    destinationAddress,
                    amount,
                    metadataHash
                )
            );
    }
}
