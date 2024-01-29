This contract will be used as a helper for all the sparse merkle tree related functions
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol


## Functions
### getRoot
```solidity
  function getRoot(
  ) public returns (bytes32)
```
Computes and returns the merkle root



### _addLeaf
```solidity
  function _addLeaf(
    bytes32 leaf
  ) internal
```
Add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leaf` | bytes32 | Leaf

### verifyMerkleProof
```solidity
  function verifyMerkleProof(
    bytes32 leaf,
    bytes32[32] smtProof,
    uint32 index,
    bytes32 root
  ) public returns (bool)
```
Verify merkle proof


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leaf` | bytes32 | Leaf
|`smtProof` | bytes32[32] | Smt proof
|`index` | uint32 | Index of the leaf
|`root` | bytes32 | Merkle root

