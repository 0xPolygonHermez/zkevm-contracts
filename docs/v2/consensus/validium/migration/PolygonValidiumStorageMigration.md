Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
It is advised to use timelocks for the admin address in case of Validium since if can change the dataAvailabilityProtocol


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridgeV2 _bridgeAddress,
    contract PolygonRollupManager _rollupManager
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRootV2 | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridgeV2 | Bridge address
|`_rollupManager` | contract PolygonRollupManager | Global exit root manager address

### initializeMigration
```solidity
  function initializeMigration(
  ) external
```




### sequenceBatchesValidium
```solidity
  function sequenceBatchesValidium(
    struct PolygonValidiumStorageMigration.ValidiumBatchData[] batches,
    uint64 maxSequenceTimestamp,
    uint64 initSequencedBatch,
    address l2Coinbase,
    bytes dataAvailabilityMessage
  ) external
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonValidiumStorageMigration.ValidiumBatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`maxSequenceTimestamp` | uint64 | Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds).
This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.
|`initSequencedBatch` | uint64 | This parameter must match the current last batch sequenced.
This will be a protection for the sequencer to avoid sending undesired data
|`l2Coinbase` | address | Address that will receive the fees from L2
|`dataAvailabilityMessage` | bytes | Byte array containing the signatures and all the addresses of the committee in ascending order
[signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
note that each ECDSA signatures are used, therefore each one must be 65 bytes
note Pol is not a reentrant token

### sequenceBatches
```solidity
  function sequenceBatches(
    struct PolygonRollupBaseEtrogNoGap.BatchData[] batches,
    uint64 maxSequenceTimestamp,
    uint64 initSequencedBatch,
    address l2Coinbase
  ) public
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonRollupBaseEtrogNoGap.BatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`maxSequenceTimestamp` | uint64 | Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds).
This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.
|`initSequencedBatch` | uint64 | This parameter must match the current last batch sequenced.
This will be a protection for the sequencer to avoid sending undesired data
|`l2Coinbase` | address | Address that will receive the fees from L2
note Pol is not a reentrant token

### setDataAvailabilityProtocol
```solidity
  function setDataAvailabilityProtocol(
    contract IDataAvailabilityProtocol newDataAvailabilityProtocol
  ) external
```
Allow the admin to set a new data availability protocol


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newDataAvailabilityProtocol` | contract IDataAvailabilityProtocol | Address of the new data availability protocol

### switchSequenceWithDataAvailability
```solidity
  function switchSequenceWithDataAvailability(
    bool newIsSequenceWithDataAvailabilityAllowed
  ) external
```
Allow the admin to switch the sequence with data availability


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newIsSequenceWithDataAvailabilityAllowed` | bool | Boolean to switch

## Events
### SetDataAvailabilityProtocol
```solidity
  event SetDataAvailabilityProtocol(
  )
```

Emitted when the admin updates the data availability protocol

### SwitchSequenceWithDataAvailability
```solidity
  event SwitchSequenceWithDataAvailability(
  )
```

Emitted when switch the ability to sequence with data availability

