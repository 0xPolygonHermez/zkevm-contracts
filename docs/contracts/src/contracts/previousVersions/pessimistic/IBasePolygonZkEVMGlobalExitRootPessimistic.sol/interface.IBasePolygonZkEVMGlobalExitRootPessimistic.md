# IBasePolygonZkEVMGlobalExitRootPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/previousVersions/pessimistic/IBasePolygonZkEVMGlobalExitRootPessimistic.sol)


## Functions
### updateExitRoot


```solidity
function updateExitRoot(bytes32 newRollupExitRoot) external;
```

### globalExitRootMap


```solidity
function globalExitRootMap(bytes32 globalExitRootNum) external returns (uint256);
```

## Errors
### OnlyAllowedContracts
Thrown when the caller is not the allowed contracts


```solidity
error OnlyAllowedContracts();
```

### OnlyGlobalExitRootUpdater
Thrown when the caller is not the coinbase neither the globalExitRootUpdater


```solidity
error OnlyGlobalExitRootUpdater();
```

### OnlyGlobalExitRootRemover
Thrown when the caller is not the globalExitRootRemover


```solidity
error OnlyGlobalExitRootRemover();
```

### GlobalExitRootAlreadySet
Thrown when trying to insert a global exit root that is already set


```solidity
error GlobalExitRootAlreadySet();
```

### NotEnoughGlobalExitRootsInserted
Thrown when trying to remove more global exit roots thank inserted


```solidity
error NotEnoughGlobalExitRootsInserted();
```

### NotLastInsertedGlobalExitRoot
Thrown when trying to remove a ger that is not the last one


```solidity
error NotLastInsertedGlobalExitRoot();
```

