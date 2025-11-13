# PolygonPessimisticConsensus
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/consensus/pessimistic/PolygonPessimisticConsensus.sol)

**Inherits:**
[PolygonConsensusBase](/contracts/v2/lib/PolygonConsensusBase.sol/abstract.PolygonConsensusBase.md), [IPolygonPessimisticConsensus](/contracts/v2/interfaces/IPolygonPessimisticConsensus.sol/interface.IPolygonPessimisticConsensus.md)


## State Variables
### CONSENSUS_TYPE

```solidity
uint32 public constant CONSENSUS_TYPE = 0;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager
) PolygonConsensusBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManager`|Rollup manager address|


### getConsensusHash

Note Return the necessary consensus information for the proof hashed


```solidity
function getConsensusHash() public view returns (bytes32);
```

