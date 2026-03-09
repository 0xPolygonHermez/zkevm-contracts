# DepositContractBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/DepositContractBase.sol)

This contract will be used as a helper for all the sparse merkle tree related functions
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol


## State Variables
### _DEPOSIT_CONTRACT_TREE_DEPTH

```solidity
uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32
```


### _MAX_DEPOSIT_COUNT

```solidity
uint256 internal constant _MAX_DEPOSIT_COUNT = 2 ** _DEPOSIT_CONTRACT_TREE_DEPTH - 1
```


### _branch

```solidity
bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] internal _branch
```


### depositCount

```solidity
uint256 public depositCount
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.

**Note:**
oz-renamed-from: _gap


```solidity
uint256[10] private __gap
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
) internal pure virtual returns (bool);
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
    internal
    pure
    virtual
    returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafHash`|`bytes32`|Leaf hash|
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|


### _checkValidSubtreeFrontier

Validates that a frontier represents a valid subtree

Checks that frontier elements match Merkle proof siblings at appropriate heights

Also enforces that non-matched frontier positions are set to zero for clean data


```solidity
function _checkValidSubtreeFrontier(
    uint256 subTreeLeafCount,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata subTreeFrontier,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata currentTreeProof
) internal pure;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`subTreeLeafCount`|`uint256`|The number of leaves in the subtree|
|`subTreeFrontier`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|The proposed frontier of the subtree (unused positions must be zero)|
|`currentTreeProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|The Merkle proof siblings from the current tree|


## Errors
### MerkleTreeFull
Thrown when the merkle tree is full


```solidity
error MerkleTreeFull();
```

### NewDepositCountExceedsMax
Thrown when the new deposit count exceeds the maximum allowed


```solidity
error NewDepositCountExceedsMax();
```

### SubtreeFrontierMismatch
Thrown when subtree frontier element doesn't match the expected proof sibling


```solidity
error SubtreeFrontierMismatch();
```

### NonZeroValueForUnusedFrontier
Thrown when non-matched frontier positions contain non-zero values


```solidity
error NonZeroValueForUnusedFrontier();
```

