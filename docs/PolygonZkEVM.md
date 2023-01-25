Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## Functions
### initialize
```solidity
  function initialize(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IVerifierRollup _rollupVerifier,
    contract IPolygonZkEVMBridge _bridgeAddress,
    struct PolygonZkEVM.InitializePackedParameters initializePackedParameters,
    bytes32 genesisRoot,
    string _trustedSequencerURL,
    string _networkName
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | Rollup verifier address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address
|`initializePackedParameters` | struct PolygonZkEVM.InitializePackedParameters | Struct to save gas and avoid stack too depp errors
|`genesisRoot` | bytes32 | Rollup genesis root
|`_trustedSequencerURL` | string | Trusted sequencer URL
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct PolygonZkEVM.BatchData[] batches
  ) external
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonZkEVM.BatchData[] | Struct array which the necessary data to append new batces ot the sequence

### verifyBatches
```solidity
  function verifyBatches(
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proofA,
    uint256[2] proofB,
    uint256[2][2] proofC
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | bytes32 | zk-snark input
|`proofB` | uint256[2] | zk-snark input
|`proofC` | uint256[2][2] | zk-snark input

### trustedVerifyBatches
```solidity
  function trustedVerifyBatches(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Init pending state, 0 when consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### _verifyBatches
```solidity
  function _verifyBatches(
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proofA,
    uint256[2] proofB,
    uint256[2][2] proofC
  ) internal
```
Verify batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | bytes32 | zk-snark input
|`proofB` | uint256[2] | zk-snark input
|`proofC` | uint256[2][2] | zk-snark input

### _tryConsolidatePendingState
```solidity
  function _tryConsolidatePendingState(
  ) internal
```
Internal function to consolidate the state automatically once sequence or verify batches are called
It trys to consolidate the first and the middle pending state in the queue



### consolidatePendingState
```solidity
  function consolidatePendingState(
    uint64 pendingStateNum
  ) external
```
Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Pending state to consolidate

### _consolidatePendingState
```solidity
  function _consolidatePendingState(
    uint64 pendingStateNum
  ) internal
```
Internal function to consolidate any pending state that has already exceed the pendingStateTimeout


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Pending state to consolidate

### _updateBatchFee
```solidity
  function _updateBatchFee(
    uint64 newLastVerifiedBatch
  ) internal
```
Function to update the batch fee based on the new verfied batches
The batch fee will not be updated when the trusted aggregator verify batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newLastVerifiedBatch` | uint64 | New last verified batch

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 maticAmount
  ) external
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
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct PolygonZkEVM.ForcedBatchData[] batches
  ) external
```
Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonZkEVM.ForcedBatchData[] | Struct array which the necessary data to append new batces ot the sequence

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) external
```
Allow the admin to set a new trusted sequencer


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequuencer

### setForceBatchAllowed
```solidity
  function setForceBatchAllowed(
    bool newForceBatchAllowed
  ) external
```
Allow the admin to allow/disallow the forceBatch functionality


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newForceBatchAllowed` | bool | Whether is allowed or not the forceBatch functionality

### setTrustedSequencerURL
```solidity
  function setTrustedSequencerURL(
    string newTrustedSequencerURL
  ) external
```
Allow the admin to set the trusted sequencer URL


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### setTrustedAggregator
```solidity
  function setTrustedAggregator(
    address newTrustedAggregator
  ) external
```
Allow the admin to set a new trusted aggregator address
If address 0 is set, everyone is free to aggregate


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedAggregator` | address | Address of the new trusted aggregator

### setTrustedAggregatorTimeout
```solidity
  function setTrustedAggregatorTimeout(
    uint64 newTrustedAggregatorTimeout
  ) external
```
Allow the admin to set a new trusted aggregator timeout
The timeout can only be lowered, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedAggregatorTimeout` | uint64 | Trusted aggreagator timeout

### setPendingStateTimeout
```solidity
  function setPendingStateTimeout(
    uint64 newPendingStateTimeout
  ) external
```
Allow the admin to set a new trusted aggregator timeout
The timeout can only be lowered, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingStateTimeout` | uint64 | Trusted aggreagator timeout

### setMultiplierBatchFee
```solidity
  function setMultiplierBatchFee(
    uint16 newMultiplierBatchFee
  ) external
```
Allow the admin to set a new multiplier batch fee


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newMultiplierBatchFee` | uint16 | multiplier bathc fee

### setVeryBatchTimeTarget
```solidity
  function setVeryBatchTimeTarget(
    uint64 newVeryBatchTimeTarget
  ) external
```
Allow the admin to set a new verify batch time target


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVeryBatchTimeTarget` | uint64 | Verify batch time target

### setAdmin
```solidity
  function setAdmin(
    address newAdmin
  ) external
```
Allow the current admin to set a new admin address


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newAdmin` | address | Address of the new admin

### overridePendingState
```solidity
  function overridePendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) external
```
Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 when consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) external
```
Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 when consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### _proveDistinctPendingState
```solidity
  function _proveDistinctPendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) internal
```
Internal functoin that prove a different state root given the same batches to verify


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 when consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### activateEmergencyState
```solidity
  function activateEmergencyState(
    uint64 sequencedBatchNum
  ) external
```
Function to activate emergency state, which also enable the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contrats
If not called by the owner owner must be provided a batcnNum that does not have been aggregated in a HALT_AGGREGATION_TIMEOUT period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`sequencedBatchNum` | uint64 | Sequenced batch number that has not been aggreagated in HALT_AGGREGATION_TIMEOUT

### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contrats



### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contrats



### getCurrentBatchFee
```solidity
  function getCurrentBatchFee(
  ) public returns (uint256)
```
Function to get the batch fee



### getLastVerifiedBatch
```solidity
  function getLastVerifiedBatch(
  ) public returns (uint64)
```
Get the last verified batch



### isPendingStateConsolidable
```solidity
  function isPendingStateConsolidable(
  ) public returns (bool)
```
Returns a boolean that indicates if the pendingStateNum is or not consolidable
Note that his function do not check if the pending state currently exist, or if it's consolidated already



### calculateRewardPerBatch
```solidity
  function calculateRewardPerBatch(
  ) public returns (uint256)
```
Function to calculate the reward to verify a single batch



### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) public returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint64 | Batch which the aggregator starts teh verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

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

### VerifyBatches
```solidity
  event VerifyBatches(
  )
```

Emitted when a aggregator verifies batches

### TrustedVerifyBatches
```solidity
  event TrustedVerifyBatches(
  )
```

Emitted when the trusted aggregator verifies batches

### ConsolidatePendingState
```solidity
  event ConsolidatePendingState(
  )
```

Emitted when pending state is consolidated

### SetTrustedSequencer
```solidity
  event SetTrustedSequencer(
  )
```

Emitted when the admin update the trusted sequencer address

### SetForceBatchAllowed
```solidity
  event SetForceBatchAllowed(
  )
```

Emitted when the admin update the forcebatch boolean

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when the admin update the seequencer URL

### SetTrustedAggregatorTimeout
```solidity
  event SetTrustedAggregatorTimeout(
  )
```

Emitted when the admin update the trusted aggregator timeout

### SetPendingStateTimeout
```solidity
  event SetPendingStateTimeout(
  )
```

Emitted when the admin update the pending state timeout

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when the admin update the trusted aggregator address

### SetMultiplierBatchFee
```solidity
  event SetMultiplierBatchFee(
  )
```

Emitted when the admin update the multiplier batch fee

### SetVeryBatchTimeTarget
```solidity
  event SetVeryBatchTimeTarget(
  )
```

Emitted when the admin update the verify batch timeout

### SetAdmin
```solidity
  event SetAdmin(
  )
```

Emitted when a admin update his address

### ProveNonDeterministicPendingState
```solidity
  event ProveNonDeterministicPendingState(
  )
```

Emitted when is proved a different state given the same batches

### OverridePendingState
```solidity
  event OverridePendingState(
  )
```

Emitted when the trusted aggregator overrides pending state

