# LegacyZKEVMStateVariables
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/LegacyZKEVMStateVariables.sol)

Since the current contract of PolygonZkEVM will be upgraded to a PolygonRollupManager there's defined
all the legacy public variables in order to not use previous used storage slots
The variables will be used by the RollupManager only for initialize the zkEVM inside the initializer function


## State Variables
### _legacyVerifyBatchTimeTarget
**Note:**
oz-renamed-from: verifyBatchTimeTarget


```solidity
uint64 internal _legacyVerifyBatchTimeTarget;
```


### _legacyMultiplierBatchFee
**Note:**
oz-renamed-from: multiplierBatchFee


```solidity
uint16 internal _legacyMultiplierBatchFee;
```


### _legacyTrustedSequencer
**Note:**
oz-renamed-from: trustedSequencer


```solidity
address internal _legacyTrustedSequencer;
```


### _legacyBatchFee
**Note:**
oz-renamed-from: batchFee


```solidity
uint256 internal _legacyBatchFee;
```


### _legacyForcedBatches
**Note:**
oz-renamed-from: forcedBatches


```solidity
mapping(uint64 => bytes32) internal _legacyForcedBatches;
```


### _legacySequencedBatches
**Note:**
oz-renamed-from: sequencedBatches


```solidity
mapping(uint64 => SequencedBatchData) internal _legacySequencedBatches;
```


### _legacyLastTimestamp
**Note:**
oz-renamed-from: lastTimestamp


```solidity
uint64 internal _legacyLastTimestamp;
```


### _legacylastBatchSequenced
**Note:**
oz-renamed-from: lastBatchSequenced


```solidity
uint64 internal _legacylastBatchSequenced;
```


### _legacyLastForceBatchSequenced
**Note:**
oz-renamed-from: lastForceBatchSequenced


```solidity
uint64 internal _legacyLastForceBatchSequenced;
```


### _legacyLastForceBatch
**Note:**
oz-renamed-from: lastForceBatch


```solidity
uint64 internal _legacyLastForceBatch;
```


### _legacyLastVerifiedBatch
**Note:**
oz-renamed-from: lastVerifiedBatch


```solidity
uint64 internal _legacyLastVerifiedBatch;
```


### _legacyTrustedAggregator
**Note:**
oz-renamed-from: trustedAggregator


```solidity
address internal _legacyTrustedAggregator;
```


### _legacyBatchNumToStateRoot
**Note:**
oz-renamed-from: batchNumToStateRoot


```solidity
mapping(uint64 => bytes32) internal _legacyBatchNumToStateRoot;
```


### _legacyTrustedSequencerURL
**Note:**
oz-renamed-from: trustedSequencerURL


```solidity
string internal _legacyTrustedSequencerURL;
```


### _legacyNetworkName
**Note:**
oz-renamed-from: networkName


```solidity
string internal _legacyNetworkName;
```


### _legacyPendingStateTransitions
**Note:**
oz-renamed-from: pendingStateTransitions


```solidity
mapping(uint256 => PendingState) internal _legacyPendingStateTransitions;
```


### _legacyLastPendingState
**Note:**
oz-renamed-from: lastPendingState


```solidity
uint64 internal _legacyLastPendingState;
```


### _legacyLastPendingStateConsolidated
**Note:**
oz-renamed-from: lastPendingStateConsolidated


```solidity
uint64 internal _legacyLastPendingStateConsolidated;
```


### _legacyPendingStateTimeout
**Note:**
oz-renamed-from: pendingStateTimeout


```solidity
uint64 internal _legacyPendingStateTimeout;
```


### _legacyTrustedAggregatorTimeout
**Note:**
oz-renamed-from: trustedAggregatorTimeout


```solidity
uint64 internal _legacyTrustedAggregatorTimeout;
```


### _legacyAdmin
**Note:**
oz-renamed-from: admin


```solidity
address internal _legacyAdmin;
```


### _legacyPendingAdmin
**Note:**
oz-renamed-from: pendingAdmin


```solidity
address internal _legacyPendingAdmin;
```


### _legacyForceBatchTimeout
**Note:**
oz-renamed-from: forceBatchTimeout


```solidity
uint64 internal _legacyForceBatchTimeout;
```


### _legacyIsForcedBatchDisallowed
**Note:**
oz-renamed-from: isForcedBatchDisallowed


```solidity
bool internal _legacyIsForcedBatchDisallowed;
```


### _legacyVersion
**Note:**
oz-renamed-from: version


```solidity
uint256 internal _legacyVersion;
```


### _legacyLastVerifiedBatchBeforeUpgrade
**Note:**
oz-renamed-from: lastVerifiedBatchBeforeUpgrade


```solidity
uint256 internal _legacyLastVerifiedBatchBeforeUpgrade;
```


## Structs
### SequencedBatchData
Struct which will be stored for every batch sequence


```solidity
struct SequencedBatchData {
    bytes32 accInputHash;
    uint64 sequencedTimestamp;
    uint64 previousLastBatchSequenced;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`accInputHash`|`bytes32`|Hash chain that contains all the information to process a batch: Before etrog: keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress) Etrog: keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 l1InfoRoot/forcedGlobalExitRoot, uint64 currentTimestamp/forcedTimestamp, address l2Coinbase, bytes32 0/forcedBlockHashL1)|
|`sequencedTimestamp`|`uint64`|Sequenced timestamp|
|`previousLastBatchSequenced`|`uint64`|Previous last batch sequenced before the current one, this is used to properly calculate the fees|

### PendingState
Struct to store the pending states
Pending state will be an intermediary state, that after a timeout can be consolidated, which means that will be added
to the state root mapping, and the global exit root will be updated
This is a protection mechanism against soundness attacks, that will be turned off in the future


```solidity
struct PendingState {
    uint64 timestamp;
    uint64 lastVerifiedBatch;
    bytes32 exitRoot;
    bytes32 stateRoot;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`timestamp`|`uint64`|Timestamp where the pending state is added to the queue|
|`lastVerifiedBatch`|`uint64`|Last batch verified batch of this pending state|
|`exitRoot`|`bytes32`|Pending exit root|
|`stateRoot`|`bytes32`|Pending state root|

