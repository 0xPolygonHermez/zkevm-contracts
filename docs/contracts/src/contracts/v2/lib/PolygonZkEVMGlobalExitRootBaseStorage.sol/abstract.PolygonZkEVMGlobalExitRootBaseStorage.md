# PolygonZkEVMGlobalExitRootBaseStorage
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/PolygonZkEVMGlobalExitRootBaseStorage.sol)

**Inherits:**
[IPolygonZkEVMGlobalExitRootV2](/contracts/v2/interfaces/IPolygonZkEVMGlobalExitRootV2.sol/interface.IPolygonZkEVMGlobalExitRootV2.md)

Since the current contract of PolygonZkEVMGlobalExitRoot will be upgraded to a PolygonZkEVMGlobalExitRootV2, and it will implement
the DepositContractBase, this base is needed to preserve the previous storage slots


## State Variables
### lastRollupExitRoot

```solidity
bytes32 public lastRollupExitRoot;
```


### lastMainnetExitRoot

```solidity
bytes32 public lastMainnetExitRoot;
```


### globalExitRootMap

```solidity
mapping(bytes32 => uint256) public globalExitRootMap;
```


