# LegacyAgglayerGERBaseStorage
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/LegacyAgglayerGERBaseStorage.sol)

**Inherits:**
[IAgglayerGER](/contracts/interfaces/IAgglayerGER.sol/interface.IAgglayerGER.md)

Since the current contract of PolygonZkEVMGlobalExitRoot will be upgraded to a AgglayerGER, and it will implement
the DepositContractBase, this base is needed to preserve the previous storage slots


## State Variables
### lastRollupExitRoot

```solidity
bytes32 public lastRollupExitRoot
```


### lastMainnetExitRoot

```solidity
bytes32 public lastMainnetExitRoot
```


### globalExitRootMap

```solidity
mapping(bytes32 => uint256) public globalExitRootMap
```


