# LegacyAgglayerGERL2Mock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/mocks/LegacyAgglayerGERL2Mock.sol)

**Inherits:**
[LegacyAgglayerGERL2](/contracts/LegacyAgglayerGERL2.sol/contract.LegacyAgglayerGERL2.md)

Contract responsible for managing the exit roots across multiple networks


## Functions
### constructor


```solidity
constructor(address _bridgeAddress) LegacyAgglayerGERL2(_bridgeAddress);
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


