# IAggchainBasePrevious
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/aggchain/IAggchainBasePrevious.sol)

**Inherits:**
[IAggchainBaseErrorsPrevious](/contracts/previousVersions/aggchain/IAggchainBasePrevious.sol/interface.IAggchainBaseErrorsPrevious.md), [IAggchainBaseEventsPrevious](/contracts/previousVersions/aggchain/IAggchainBasePrevious.sol/interface.IAggchainBaseEventsPrevious.md)

**Title:**
IAggchainBase

Shared interface for native aggchain implementations.


## Functions
### getAggchainHash

Gets aggchain hash.

Each chain should properly manage its own aggchain hash.


```solidity
function getAggchainHash(bytes calldata aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to build the consensus hash.|


### onVerifyPessimistic

Callback from the AgglayerManager to update the chain's state.

Each chain should properly manage its own state.


```solidity
function onVerifyPessimistic(bytes calldata aggchainData) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to update chain's state|


### initAggchainManager

Sets the aggchain manager.


```solidity
function initAggchainManager(address newAggchainManager) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|The address of the new aggchain manager.|


### AGGCHAIN_TYPE

Returns the unique aggchain type identifier.


```solidity
function AGGCHAIN_TYPE() external view returns (bytes2);
```

