This contract will be used as a helper for all the sparse merkle tree related functions.
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol.


## Functions
### getDepositRoot
```solidity
  function getDepositRoot(
  ) public returns (bytes32)
```
Computes and returns the merkle root.



### _deposit
```solidity
  function _deposit(
    bytes32 leafHash
  ) internal
```
Add a new leaf to the merkle tree.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafHash` | bytes32 | Leaf hash

### verifyMerkleProof
```solidity
  function verifyMerkleProof(
    bytes32 leafHash,
    bytes32[] smtProof,
    uint64 index,
    bytes32 root
  ) public returns (bool)
```
Verify merkle proof.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafHash` | bytes32 | Leaf hash
|`smtProof` | bytes32[] | Smt proof
|`index` | uint64 | Index of the leaf
|`root` | bytes32 | Merkle root

### getLeafValue
```solidity
  function getLeafValue(
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes32 metadataHash
  ) public returns (bytes32)
```
Given the leaf data returns the leaf value.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin Network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for ether
|`destinationNetwork` | uint32 | Destination network
|`destinationAddress` | address | Destination address
|`amount` | uint256 | Amount of tokens
|`metadataHash` | bytes32 | Hash of the metadata

