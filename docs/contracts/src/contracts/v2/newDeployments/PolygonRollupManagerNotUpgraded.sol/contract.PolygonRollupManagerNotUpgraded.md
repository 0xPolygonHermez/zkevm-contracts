# PolygonRollupManagerNotUpgraded
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/newDeployments/PolygonRollupManagerNotUpgraded.sol)

**Inherits:**
[PolygonRollupManager](/contracts/v2/PolygonRollupManager.sol/contract.PolygonRollupManager.md)

PolygonRollupManager Test


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridge _bridgeAddress,
    IAggLayerGateway _aggLayerGateway
) PolygonRollupManager(_globalExitRootManager, _pol, _bridgeAddress, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|MATIC token address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|
|`_aggLayerGateway`|`IAggLayerGateway`||


### initialize


```solidity
function initialize(address trustedAggregator, address admin, address timelock, address emergencyCouncil)
    external
    reinitializer(4);
```

