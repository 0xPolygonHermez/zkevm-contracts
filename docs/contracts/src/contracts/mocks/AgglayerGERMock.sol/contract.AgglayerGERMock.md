# AgglayerGERMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/mocks/AgglayerGERMock.sol)

**Inherits:**
[AgglayerGER](/contracts/AgglayerGER.sol/contract.AgglayerGER.md)

AgglayerManager mock


## Functions
### constructor


```solidity
constructor(address _rollupManager, address _bridgeAddress) AgglayerGER(_rollupManager, _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupManager`|`address`|Rollup manager contract address|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### injectGER


```solidity
function injectGER(bytes32 _root, uint32 depositCount) external;
```

