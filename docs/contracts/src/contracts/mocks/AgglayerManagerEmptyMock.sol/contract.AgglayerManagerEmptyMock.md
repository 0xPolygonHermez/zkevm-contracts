# AgglayerManagerEmptyMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/mocks/AgglayerManagerEmptyMock.sol)

**Inherits:**
[EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md)

AgglayerManager used only to test conensus contracts


## State Variables
### currentSequenceBatches

```solidity
uint256 currentSequenceBatches
```


### acceptSequenceBatches

```solidity
bool acceptSequenceBatches = true
```


## Functions
### setAcceptSequenceBatches


```solidity
function setAcceptSequenceBatches(bool newAcceptSequenceBatches) public;
```

### onSequenceBatches


```solidity
function onSequenceBatches(uint64 newSequencedBatches, bytes32 newAccInputHash) external returns (uint64);
```

### onVerifyBatches


```solidity
function onVerifyBatches(uint64 finalNewBatch, bytes32 newStateRoot, IPolygonRollupBase rollup)
    external
    returns (uint64);
```

### getBatchFee


```solidity
function getBatchFee() public view returns (uint256);
```

### getForcedBatchFee


```solidity
function getForcedBatchFee() public view returns (uint256);
```

### activateEmergencyState

Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts


```solidity
function activateEmergencyState() external;
```

### lastDeactivatedEmergencyStateTimestamp

Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts


```solidity
function lastDeactivatedEmergencyStateTimestamp() external returns (uint256);
```

### deactivateEmergencyState

Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts


```solidity
function deactivateEmergencyState() external;
```

