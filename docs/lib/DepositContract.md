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
    address token,
    uint256 amount,
    uint32 destinationNetwork,
    uint32 destinationAddress
  ) internal
```
Add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | Token address, 0 address is reserved for ether
|`amount` | uint256 | Amount of tokens
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | uint32 | Address destination

### verifyMerkleProof
```solidity
  function verifyMerkleProof(
    address token,
    uint256 amount,
    uint32 originalNetwork,
    uint32 destinationNetwork,
    address destinationAddress,
    bytes32[] smtProof,
    uint64 index,
    bytes32 root
  ) public returns (bool)
```
Verify merkle proof


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address |  Token address, 0 address is reserved for ether
|`amount` | uint256 | Amount of tokens
|`originalNetwork` | uint32 | Origin Network
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`smtProof` | bytes32[] | Smt proof
|`index` | uint64 | Index of the leaf
|`root` | bytes32 | Merkle root

