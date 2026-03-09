# IAgglayerGERL2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAgglayerGERL2.sol)

**Inherits:**
[IBaseLegacyAgglayerGER](/contracts/interfaces/IBaseLegacyAgglayerGER.sol/interface.IBaseLegacyAgglayerGER.md)

**Title:**
IAgglayerGERL2

Interface for the AgglayerGERL2 contract that manages global exit roots on L2


## Functions
### insertGlobalExitRoot

Insert a new global exit root

After inserting the new global exit root, the hash chain value is updated.
A hash chain is being used to make optimized proof generations of GERs.
Can only be called by the globalExitRootUpdater


```solidity
function insertGlobalExitRoot(bytes32 _newRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newRoot`|`bytes32`|new global exit root to insert|


### transferGlobalExitRootUpdater

Starts the globalExitRootUpdater role transfer

This is a two step process, the pending globalExitRootUpdater must accept to finalize the process
Can only be called by the current globalExitRootUpdater


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Allow the current pending globalExitRootUpdater to accept the globalExitRootUpdater role

Can only be called by the pendingGlobalExitRootUpdater


```solidity
function acceptGlobalExitRootUpdater() external;
```

### globalExitRootRemover

Get the globalExitRootRemover address

This variable is exposed to be used by a BridgeL2Sovereign modifier


```solidity
function globalExitRootRemover() external view returns (address);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The address of the globalExitRootRemover|


### globalExitRootUpdater

Get the globalExitRootUpdater address


```solidity
function globalExitRootUpdater() external view returns (address);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The address of the globalExitRootUpdater|


### pendingGlobalExitRootUpdater

Get the pending globalExitRootUpdater address


```solidity
function pendingGlobalExitRootUpdater() external view returns (address);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The address of the pending globalExitRootUpdater|


### insertedGERHashChain

Get the value of the global exit roots hash chain after last insertion


```solidity
function insertedGERHashChain() external view returns (bytes32);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The current hash chain value|


