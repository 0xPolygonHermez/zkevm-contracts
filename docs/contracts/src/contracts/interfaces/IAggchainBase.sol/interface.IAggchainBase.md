# IAggchainBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAggchainBase.sol)

**Inherits:**
[IAggchainBaseErrors](/contracts/interfaces/IAggchainBase.sol/interface.IAggchainBaseErrors.md), [IAggchainBaseEvents](/contracts/interfaces/IAggchainBase.sol/interface.IAggchainBaseEvents.md), [IAggchainSigners](/contracts/interfaces/IAggchainSigners.sol/interface.IAggchainSigners.md)

**Title:**
IAggchainBase

Core interface for aggchain implementations

All aggchain contracts must implement these functions for integration with the rollup manager.
Different implementations (FEP, ECDSA) may handle these functions differently based on their consensus mechanism.


## Functions
### getAggchainHash

Gets aggchain hash for consensus verification

Each implementation computes this hash differently based on its consensus mechanism.
The hash is used by the rollup manager to verify state transitions.


```solidity
function getAggchainHash(bytes calldata aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data to build the consensus hash|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The computed aggchain hash for verification|


### onVerifyPessimistic

Callback from the AgglayerManager after successful pessimistic proof verification

Each implementation handles state updates differently


```solidity
function onVerifyPessimistic(bytes calldata aggchainData) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom chain data containing state update information|


### initAggchainManager

Sets the initial aggchain manager during contract deployment

Can only be called once by the rollup manager during initialization.
The aggchain manager has privileged access to modify consensus parameters.


```solidity
function initAggchainManager(address newAggchainManager) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAggchainManager`|`address`|The address of the new aggchain manager|


### AGGCHAIN_TYPE

Returns the unique aggchain type identifier.


```solidity
function AGGCHAIN_TYPE() external view returns (bytes2);
```

### aggchainManager

Returns the current aggchain manager address

The aggchain manager has administrative privileges over consensus parameters


```solidity
function aggchainManager() external view returns (address);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The address of the current aggchain manager|


