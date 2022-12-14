Contract responsible for managing the states and the updates of L2 network
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue
THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network
To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks


## Functions
### initialize
```solidity
  function initialize(
    contract IGlobalExitRootManager _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IVerifierRollup _rollupVerifier,
    contract IBridge _bridgeAddress,
    struct ProofOfEfficiency.InitializePackedParameters initializePackedParameters,
    bytes32 genesisRoot,
    string _trustedSequencerURL,
    string _networkName
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | rollup verifier address
|`_bridgeAddress` | contract IBridge | bridge address
|`initializePackedParameters` | struct ProofOfEfficiency.InitializePackedParameters | Struct to save gas and avoid stack too depp errors
|`genesisRoot` | bytes32 | rollup genesis root
|`_trustedSequencerURL` | string | trusted sequencer URL
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct ProofOfEfficiency.BatchData[] batches
  ) public
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.BatchData[] | Struct array which the necessary data to append new batces ot the sequence

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
  ) public
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
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proofA,
    uint256[2] proofB,
    uint256[2][2] proofC
  ) public
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

### _consolidateNextPendingState
```solidity
  function _consolidateNextPendingState(
  ) internal
```
Internal function to consolidate the next pending state if possible
Otherwise do nothing



### consolidatePendingState
```solidity
  function consolidatePendingState(
    uint64 pendingStateNum
  ) public
```
Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Pending state to consolidate

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 maticAmount
  ) public
```
Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct ProofOfEfficiency.ForcedBatchData[] batches
  ) public
```
Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.ForcedBatchData[] | Struct array which the necessary data to append new batces ot the sequence

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) public
```
Allow the current trusted sequencer to set a new trusted sequencer


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequuencer

### setForceBatchAllowed
```solidity
  function setForceBatchAllowed(
    bool newForceBatchAllowed
  ) public
```
Allow the current trusted sequencer to allow/disallow the forceBatch functionality


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newForceBatchAllowed` | bool | Whether is allowed or not the forceBatch functionality

### setTrustedSequencerURL
```solidity
  function setTrustedSequencerURL(
    string newTrustedSequencerURL
  ) public
```
Allow the trusted sequencer to set the trusted sequencer URL


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### setTrustedAggregator
```solidity
  function setTrustedAggregator(
    address newTrustedAggregator
  ) public
```
Allow the current trusted aggregator to set a new trusted aggregator address
If address 0 is set, everyone is free to aggregate


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedAggregator` | address | Address of the new trusted aggregator

### setTrustedAggregatorTimeout
```solidity
  function setTrustedAggregatorTimeout(
    uint64 newTrustedAggregatorTimeout
  ) public
```
Allow the current trusted aggregator to set a new trusted aggregator timeout
The timeout can only be lowered, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedAggregatorTimeout` | uint64 | Trusted aggreagator timeout

### setAdmin
```solidity
  function setAdmin(
    address newAdmin
  ) public
```
Allow the current admin to set a new admin address


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newAdmin` | address | Address of the new admin

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    uint64 newStateRoot,
    bytes32 proofA,
    bytes32 proofB,
    uint256[2] proofC
  ) public
```
Allows to halt the PoE if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | uint64 | New State root once the batch is processed
|`proofA` | bytes32 | zk-snark input
|`proofB` | bytes32 | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### activateEmergencyState
```solidity
  function activateEmergencyState(
    uint64 sequencedBatchNum
  ) external
```
Function to activate emergency state, which also enable the emergency mode on both PoE and Bridge contrats
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
Function to deactivate emergency state on both PoE and Bridge contrats



### calculateBatchFee
```solidity
  function calculateBatchFee(
  ) public returns (uint256)
```
Function to calculate the fee that must be payed for every batch



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
    bytes32 newStateRoot
  ) public returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint64 | Batch which the aggregator starts teh verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both PoE and Bridge contrats



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

Emitted when a trusted sequencer update his address

### SetForceBatchAllowed
```solidity
  event SetForceBatchAllowed(
  )
```

Emitted when a trusted sequencer update the forcebatch boolean

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when a trusted sequencer update his URL

### SetTrustedAggregatorTimeout
```solidity
  event SetTrustedAggregatorTimeout(
  )
```

Emitted when a trusted aggregator update the trusted aggregator timeout

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when a trusted aggregator update or renounce his address

### SetAdmin
```solidity
  event SetAdmin(
  )
```

Emitted when a admin update his address

### ProveNonDeterministicState
```solidity
  event ProveNonDeterministicState(
  )
```

Emitted when is proved a different state given the same batches

