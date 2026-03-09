# IPolygonRollupBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IPolygonRollupBase.sol)

**Inherits:**
[IPolygonConsensusBase](/contracts/interfaces/IPolygonConsensusBase.sol/interface.IPolygonConsensusBase.md)


## Functions
### onVerifyBatches


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator) external;
```

### rollbackBatches


```solidity
function rollbackBatches(uint64 targetBatch, bytes32 accInputHashToRollback) external;
```

