# DepositContractV2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/DepositContractV2.sol)

**Inherits:**
ReentrancyGuardUpgradeable, [DepositContractBase](/contracts/lib/DepositContractBase.sol/contract.DepositContractBase.md)

This contract will be used in the PolygonZkEVMBridge contract, it inherits the DepositContractBase and adds the logic
to calculate the leaf of the tree


## Functions
### getLeafValue

Given the leaf data returns the leaf value


```solidity
function getLeafValue(
    uint8 leafType,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes32 metadataHash
) internal pure virtual returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafType`|`uint8`|Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message|
|`originNetwork`|`uint32`|Origin Network|
|`originAddress`|`address`|[0] Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token, [1] msg.sender of the message|
|`destinationNetwork`|`uint32`|Destination network|
|`destinationAddress`|`address`|Destination address|
|`amount`|`uint256`|[0] Amount of tokens/ether, [1] Amount of ether|
|`metadataHash`|`bytes32`|Hash of the metadata|


