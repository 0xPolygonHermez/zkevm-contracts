Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridgeV2 _bridgeAddress,
    contract PolygonRollupManager _rollupManager
  ) internal
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRootV2 | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridgeV2 | Bridge address
|`_rollupManager` | contract PolygonRollupManager | Global exit root manager address

### initialize
```solidity
  function initialize(
    address _admin,
    address sequencer,
    uint32 networkID,
    address _gasTokenAddress,
    string sequencerURL,
    string _networkName
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_admin` | address | Admin address
|`sequencer` | address | Trusted sequencer address
|`networkID` | uint32 | Indicates the network identifier that will be used in the bridge
|`_gasTokenAddress` | address | Indicates the token address in mainnet that will be used as a gas token
Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
|`sequencerURL` | string | Trusted sequencer URL
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct PolygonRollupBaseEtrog.BatchData[] batches,
    uint32 l1InfoTreeLeafCount,
    uint64 maxSequenceTimestamp,
    bytes32 expectedFinalAccInputHash,
    address l2Coinbase
  ) public
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonRollupBaseEtrog.BatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`l1InfoTreeLeafCount` | uint32 | Index of the L1InfoRoot that will be used in this sequence
|`maxSequenceTimestamp` | uint64 | Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds).
This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.
|`expectedFinalAccInputHash` | bytes32 | This parameter must match the acc input hash after hash all the batch data
This will be a protection for the sequencer to avoid sending undesired data
|`l2Coinbase` | address | Address that will receive the fees from L2
note Pol is not a reentrant token

### onVerifyBatches
```solidity
  function onVerifyBatches(
    uint64 lastVerifiedBatch,
    bytes32 newStateRoot,
    address aggregator
  ) public
```
Callback on verify batches, can only be called by the rollup manager


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`lastVerifiedBatch` | uint64 | Last verified batch
|`newStateRoot` | bytes32 | new state root
|`aggregator` | address | Aggregator address

### rollbackBatches
```solidity
  function rollbackBatches(
    uint64 targetBatch,
    bytes32 accInputHashToRollback
  ) public
```
Callback on rollback batches, can only be called by the rollup manager


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targetBatch` | uint64 | Batch to rollback up to but not including this batch
|`accInputHashToRollback` | bytes32 | Acc input hash to rollback

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 polAmount
  ) public
```
Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected
Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
In order to assure that users force transactions will be processed properly, user must not sign any other transaction
with the same nonce


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
|`polAmount` | uint256 | Max amount of pol tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct PolygonRollupBaseEtrog.BatchData[] batches
  ) external
```
Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonRollupBaseEtrog.BatchData[] | Struct array which holds the necessary data to append force batches

### setForceBatchAddress
```solidity
  function setForceBatchAddress(
    address newForceBatchAddress
  ) external
```
Allow the admin to change the force batch address, that will be allowed to force batches
If address 0 is set, then everyone is able to force batches, this action is irreversible


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newForceBatchAddress` | address | New force batch address

### setForceBatchTimeout
```solidity
  function setForceBatchTimeout(
    uint64 newforceBatchTimeout
  ) external
```
Allow the admin to set the forcedBatchTimeout
The new value can only be lower, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newforceBatchTimeout` | uint64 | New force batch timeout

### calculatePolPerForceBatch
```solidity
  function calculatePolPerForceBatch(
  ) public returns (uint256)
```
Function to calculate the reward for a forced batch



### generateInitializeTransaction
```solidity
  function generateInitializeTransaction(
    uint32 networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    bytes _gasTokenMetadata
  ) public returns (bytes)
```
Generate Initialize transaction for hte bridge on L2


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`networkID` | uint32 | Indicates the network identifier that will be used in the bridge
|`_gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
|`_gasTokenNetwork` | uint32 | Indicates the native network of the token address
|`_gasTokenMetadata` | bytes | Abi encoded gas token metadata

### _verifyOrigin
```solidity
  function _verifyOrigin(
  ) internal returns (bytes gasTokenMetadata)
```




## Events
### SequenceBatches
```solidity
  event SequenceBatches(
  )
```

Emitted when the trusted sequencer sends a new batch of transactions

### ForceBatch
```solidity
  event ForceBatch(
  )
```

Emitted when a batch is forced

### SequenceForceBatches
```solidity
  event SequenceForceBatches(
  )
```

Emitted when forced batches are sequenced by not the trusted sequencer

### InitialSequenceBatches
```solidity
  event InitialSequenceBatches(
  )
```

Emitted when the contract is initialized, contain the first sequenced transaction

### VerifyBatches
```solidity
  event VerifyBatches(
  )
```

Emitted when a aggregator verifies batches

### RollbackBatches
```solidity
  event RollbackBatches(
  )
```

Emitted when a aggregator verifies batches

### SetForceBatchTimeout
```solidity
  event SetForceBatchTimeout(
  )
```

Emitted when the admin update the force batch timeout

### SetForceBatchAddress
```solidity
  event SetForceBatchAddress(
  )
```

Emitted when the admin update the force batch address

