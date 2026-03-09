# AgglayerManagerNotUpgraded
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/newDeployments/AgglayerManagerNotUpgraded.sol)

**Inherits:**
[AgglayerManager](/contracts/AgglayerManager.sol/contract.AgglayerManager.md)

AgglayerManager Test


## Functions
### constructor


```solidity
constructor(
    IAgglayerGER _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridge _bridgeAddress,
    IAgglayerGateway _aggLayerGateway
) AgglayerManager(_globalExitRootManager, _pol, _bridgeAddress, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IAgglayerGER`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|MATIC token address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|
|`_aggLayerGateway`|`IAgglayerGateway`||


### initialize


```solidity
function initialize(address trustedAggregator, address admin, address timelock, address emergencyCouncil)
    external
    reinitializer(5);
```

