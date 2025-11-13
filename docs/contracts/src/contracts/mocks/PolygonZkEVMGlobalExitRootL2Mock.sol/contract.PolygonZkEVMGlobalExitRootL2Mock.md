# PolygonZkEVMGlobalExitRootL2Mock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/mocks/PolygonZkEVMGlobalExitRootL2Mock.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootL2](/contracts/PolygonZkEVMGlobalExitRootL2.sol/contract.PolygonZkEVMGlobalExitRootL2.md)

Contract responsible for managing the exit roots across multiple networks


## Functions
### constructor


```solidity
constructor(address _bridgeAddress) PolygonZkEVMGlobalExitRootL2(_bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeAddress`|`address`|PolygonZkEVM Bridge contract address|


### setLastGlobalExitRoot

Set globalExitRoot


```solidity
function setLastGlobalExitRoot(bytes32 globalExitRoot, uint256 blockNumber) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalExitRoot`|`bytes32`|New global exit root|
|`blockNumber`|`uint256`|block number|


### setExitRoot

Set rollup exit root


```solidity
function setExitRoot(bytes32 newRoot) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRoot`|`bytes32`|New rollup exit root|


