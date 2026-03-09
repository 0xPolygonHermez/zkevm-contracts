# AgglayerGERL2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/sovereignChains/AgglayerGERL2.sol)

**Inherits:**
[LegacyAgglayerGERL2](/contracts/LegacyAgglayerGERL2.sol/contract.LegacyAgglayerGERL2.md), [IAgglayerGERL2](/contracts/interfaces/IAgglayerGERL2.sol/interface.IAgglayerGERL2.md), Initializable, [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

Contract responsible for managing the exit roots for the Sovereign chains and global exit roots


## State Variables
### GER_SOVEREIGN_VERSION

```solidity
string public constant GER_SOVEREIGN_VERSION = "v1.0.0"
```


### globalExitRootUpdater

```solidity
address public globalExitRootUpdater
```


### globalExitRootRemover

```solidity
address public globalExitRootRemover
```


### _legacyInsertedGERCount
**Note:**
oz-renamed-from: insertedGERCount


```solidity
uint256 internal _legacyInsertedGERCount
```


### insertedGERHashChain

```solidity
bytes32 public insertedGERHashChain
```


### removedGERHashChain

```solidity
bytes32 public removedGERHashChain
```


### pendingGlobalExitRootUpdater

```solidity
address public pendingGlobalExitRootUpdater
```


### pendingGlobalExitRootRemover

```solidity
address public pendingGlobalExitRootRemover
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[50] private __gap
```


## Functions
### constructor


```solidity
constructor(address _bridgeAddress) LegacyAgglayerGERL2(_bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### initialize

Initialize contract
Note this initialize function is exactly the same as the last version, therefore no modifications needed


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
modifier onlyGlobalExitRootUpdater() ;
```

### onlyGlobalExitRootRemover


```solidity
modifier onlyGlobalExitRootRemover() ;
```

### insertGlobalExitRoot

Insert a new global exit root

After inserting the new global exit root, the hash chain value is updated.
A hash chain is being used to make optimized proof generations of GERs.


```solidity
function insertGlobalExitRoot(bytes32 _newRoot) external onlyGlobalExitRootUpdater;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newRoot`|`bytes32`|new global exit root to insert|


### removeGlobalExitRoots

Remove global exit roots

After removing a global exit root, the removal hash chain value is updated.
A hash chain is being used to make optimized proof generations of removed GERs.


```solidity
function removeGlobalExitRoots(bytes32[] calldata gersToRemove) external onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`gersToRemove`|`bytes32[]`|Array of gers to remove|


### transferGlobalExitRootUpdater

Starts the globalExitRootUpdater role transfer
This is a two step process, the pending globalExitRootUpdater must accepted to finalize the process


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external onlyGlobalExitRootUpdater;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Allow the current pending globalExitRootUpdater to accept the globalExitRootUpdater role


```solidity
function acceptGlobalExitRootUpdater() external;
```

### transferGlobalExitRootRemover

Start the globalExitRootRemover role transfer in a two-step process


```solidity
function transferGlobalExitRootRemover(address _newGlobalExitRootRemover) external onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootRemover`|`address`|new pending globalExitRootRemover address|


### acceptGlobalExitRootRemover

Allow the current pending globalExitRootRemover to accept the globalExitRootRemover role


```solidity
function acceptGlobalExitRootRemover() external;
```

### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version of the contract.|


## Events
### UpdateHashChainValue
Emitted when a new global exit root is inserted and added to the hash chain


```solidity
event UpdateHashChainValue(bytes32 indexed newGlobalExitRoot, bytes32 indexed newHashChainValue);
```

### UpdateRemovalHashChainValue
Emitted when the global exit root is removed and added to the removal hash chain


```solidity
event UpdateRemovalHashChainValue(bytes32 indexed removedGlobalExitRoot, bytes32 indexed newRemovalHashChainValue);
```

### TransferGlobalExitRootUpdater
Emitted when the GlobalExitRootUpdater starts the two-step transfer role setting a new pending GlobalExitRootUpdater.


```solidity
event TransferGlobalExitRootUpdater(address currentGlobalExitRootUpdater, address pendingGlobalExitRootUpdater);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentGlobalExitRootUpdater`|`address`|The current GlobalExitRootUpdater.|
|`pendingGlobalExitRootUpdater`|`address`|The new pending GlobalExitRootUpdater.|

### TransferGlobalExitRootRemover
Emitted when the GlobalExitRootRemover starts the two-step transfer role setting a new pending GlobalExitRootRemover.


```solidity
event TransferGlobalExitRootRemover(address currentGlobalExitRootRemover, address pendingGlobalExitRootRemover);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentGlobalExitRootRemover`|`address`|The current GlobalExitRootUpdater.|
|`pendingGlobalExitRootRemover`|`address`|The new pending GlobalExitRootUpdater.|

### AcceptGlobalExitRootUpdater
Emitted when the pending GlobalExitRootUpdater accepts the GlobalExitRootUpdater role.


```solidity
event AcceptGlobalExitRootUpdater(address oldGlobalExitRootUpdater, address newGlobalExitRootUpdater);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldGlobalExitRootUpdater`|`address`|The previous GlobalExitRootUpdater.|
|`newGlobalExitRootUpdater`|`address`|The new GlobalExitRootUpdater.|

### AcceptGlobalExitRootRemover
Emitted when the pending GlobalExitRootRemover accepts the GlobalExitRootRemover role.


```solidity
event AcceptGlobalExitRootRemover(address oldGlobalExitRootRemover, address newGlobalExitRootRemover);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldGlobalExitRootRemover`|`address`|The previous GlobalExitRootRemover.|
|`newGlobalExitRootRemover`|`address`|The new GlobalExitRootRemover.|

