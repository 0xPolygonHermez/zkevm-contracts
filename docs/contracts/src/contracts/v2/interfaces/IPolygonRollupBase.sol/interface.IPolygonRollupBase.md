# IPolygonRollupBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonRollupBase.sol)

**Inherits:**
[IPolygonConsensusBase](/contracts/v2/interfaces/IPolygonConsensusBase.sol/interface.IPolygonConsensusBase.md)


## Functions
### onVerifyBatches


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator) external;
```

### rollbackBatches


```solidity
function rollbackBatches(uint64 targetBatch, bytes32 accInputHashToRollback) external;
```

