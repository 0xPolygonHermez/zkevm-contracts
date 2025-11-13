# DepositContractBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/DepositContractBase.sol)

This contract will be used as a helper for all the sparse merkle tree related functions
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol


## State Variables
### _DEPOSIT_CONTRACT_TREE_DEPTH

```solidity
uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;
```


### _MAX_DEPOSIT_COUNT

```solidity
uint256 internal constant _MAX_DEPOSIT_COUNT = 2 ** _DEPOSIT_CONTRACT_TREE_DEPTH - 1;
```


### _branch

```solidity
bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _branch;
```


### depositCount

```solidity
uint256 public depositCount;
```


### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.*

**Note:**
oz-renamed-from: _gap


```solidity
uint256[10] private __gap;
```


## Functions
### getRoot

Computes and returns the merkle root


```solidity
function getRoot() public view virtual returns (bytes32);
```

### _addLeaf

Add a new leaf to the merkle tree


```solidity
function _addLeaf(bytes32 leaf) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leaf`|`bytes32`|Leaf|


### verifyMerkleProof

Verify merkle proof


```solidity
function verifyMerkleProof(
    bytes32 leafHash,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
    uint32 index,
    bytes32 root
) public pure returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafHash`|`bytes32`|Leaf hash|
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|
|`root`|`bytes32`|Merkle root|


### calculateRoot

Calculate root from merkle proof


```solidity
function calculateRoot(bytes32 leafHash, bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof, uint32 index)
    public
    pure
    returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafHash`|`bytes32`|Leaf hash|
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|


## Errors
### MerkleTreeFull
*Thrown when the merkle tree is full*


```solidity
error MerkleTreeFull();
```

