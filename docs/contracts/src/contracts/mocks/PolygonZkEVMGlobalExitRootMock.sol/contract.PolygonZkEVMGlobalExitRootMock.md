# PolygonZkEVMGlobalExitRootMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/PolygonZkEVMGlobalExitRootMock.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRoot](/contracts/PolygonZkEVMGlobalExitRoot.sol/contract.PolygonZkEVMGlobalExitRoot.md)

Contract responsible for managing the exit roots across multiple networks


## Functions
### constructor


```solidity
constructor(address _rollupAddress, address _bridgeAddress)
    PolygonZkEVMGlobalExitRoot(_rollupAddress, _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupAddress`|`address`|Rollup contract address|
|`_bridgeAddress`|`address`|PolygonZkEVM Bridge contract address|


### setLastGlobalExitRoot

Set last global exit root


```solidity
function setLastGlobalExitRoot(uint256 timestamp) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`timestamp`|`uint256`|timestamp|


### setGlobalExitRoot

Set last global exit root


```solidity
function setGlobalExitRoot(bytes32 globalExitRoot, uint256 timestamp) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalExitRoot`|`bytes32`||
|`timestamp`|`uint256`|timestamp|


