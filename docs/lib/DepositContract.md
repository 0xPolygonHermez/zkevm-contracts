This contract will be used as a helper for all the sparse merkle tree related functions
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol


## Functions
### getDepositRoot
```solidity
  function getDepositRoot(
  ) public returns (bytes32)
```
Computes and returns the merkle root



### _deposit
```solidity
  function _deposit(
    bytes32 leafHash
  ) internal
```
Add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafHash` | bytes32 | Leaf hash

### verifyMerkleProof
```solidity
  function verifyMerkleProof(
    bytes32 leafHash,
    bytes32[32] smtProof,
    uint32 index,
    bytes32 root
  ) public returns (bool)
```
Verify merkle proof


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafHash` | bytes32 | Leaf hash
|`smtProof` | bytes32[32] | Smt proof
|`index` | uint32 | Index of the leaf
|`root` | bytes32 | Merkle root

### getLeafValue
```solidity
  function getLeafValue(
    uint8 leafType,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes32 metadataHash
  ) public returns (bytes32)
```
Given the leaf data returns the leaf value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafType` | uint8 | Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message
|`originNetwork` | uint32 | Origin Network
|`originAddress` | address | [0] Origin token address, 0 address is reserved for ether, [1] msg.sender of the message
|`destinationNetwork` | uint32 | Destination network
|`destinationAddress` | address | Destination address
|`amount` | uint256 | [0] Amount of tokens/ether, [1] Amount of ether
|`metadataHash` | bytes32 | Hash of the metadata

