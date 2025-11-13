# GlobalExitRootManagerL2SovereignChainPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/pessimistic/GlobalExitRootManagerL2SovereignChainPessimistic.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootL2Pessimistic](/contracts/v2/previousVersions/pessimistic/PolygonZkEVMGlobalExitRootL2Pessimistic.sol/contract.PolygonZkEVMGlobalExitRootL2Pessimistic.md), Initializable

Contract responsible for managing the exit roots for the Sovereign chains and global exit roots


## State Variables
### globalExitRootUpdater

```solidity
address public globalExitRootUpdater;
```


### globalExitRootRemover

```solidity
address public globalExitRootRemover;
```


### insertedGERCount

```solidity
uint256 public insertedGERCount;
```


## Functions
### constructor


```solidity
constructor(address _bridgeAddress) PolygonZkEVMGlobalExitRootL2Pessimistic(_bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### initialize

Initialize contract


```solidity
function initialize(address _globalExitRootUpdater, address _globalExitRootRemover) external virtual initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootUpdater`|`address`|setting the globalExitRootUpdater.|
|`_globalExitRootRemover`|`address`|In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim and go back and the execution would be correctly proved.|


### onlyGlobalExitRootUpdater


```solidity
modifier onlyGlobalExitRootUpdater();
```

### onlyGlobalExitRootRemover


```solidity
modifier onlyGlobalExitRootRemover();
```

### insertGlobalExitRoot

Insert a new global exit root


```solidity
function insertGlobalExitRoot(bytes32 _newRoot) external onlyGlobalExitRootUpdater;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newRoot`|`bytes32`|new global exit root to insert|


### removeLastGlobalExitRoots

Remove last global exit roots


```solidity
function removeLastGlobalExitRoots(bytes32[] calldata gersToRemove) external onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`gersToRemove`|`bytes32[]`|Array of gers to remove in inserted order where first element of the array is the last inserted|


### setGlobalExitRootUpdater

Set the globalExitRootUpdater


```solidity
function setGlobalExitRootUpdater(address _globalExitRootUpdater) external onlyGlobalExitRootUpdater;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootUpdater`|`address`|new globalExitRootUpdater address|


### setGlobalExitRootRemover

Set the globalExitRootRemover


```solidity
function setGlobalExitRootRemover(address _globalExitRootRemover) external onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootRemover`|`address`|new globalExitRootRemover address|


## Events
### InsertGlobalExitRoot
*Emitted when a new global exit root is inserted*


```solidity
event InsertGlobalExitRoot(bytes32 indexed newGlobalExitRoot);
```

### RemoveLastGlobalExitRoot
*Emitted when the last global exit root is removed*


```solidity
event RemoveLastGlobalExitRoot(bytes32 indexed removedGlobalExitRoot);
```

### SetGlobalExitRootUpdater
*Emitted when the globalExitRootUpdater is set*


```solidity
event SetGlobalExitRootUpdater(address indexed newGlobalExitRootUpdater);
```

### SetGlobalExitRootRemover
*Emitted when the globalExitRootRemover is set*


```solidity
event SetGlobalExitRootRemover(address indexed newGlobalExitRootRemover);
```

