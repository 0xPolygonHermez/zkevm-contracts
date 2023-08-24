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
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IVerifierRollup _rollupVerifier,
    contract IPolygonZkEVMBridge _bridgeAddress,
    contract ICDKDataCommittee _dataCommitteeAddress,
    uint64 _chainID,
    uint64 _forkID
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | Rollup verifier address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address
|`_dataCommitteeAddress` | contract ICDKDataCommittee | Data committee address
|`_chainID` | uint64 | L2 chainID
|`_forkID` | uint64 | Fork Id

### initialize
```solidity
  function initialize(
    struct CDKValidium.InitializePackedParameters initializePackedParameters,
    bytes32 genesisRoot,
    string _trustedSequencerURL,
    string _networkName
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initializePackedParameters` | struct CDKValidium.InitializePackedParameters | Struct to save gas and avoid stack too deep errors
|`genesisRoot` | bytes32 | Rollup genesis root
|`_trustedSequencerURL` | string | Trusted sequencer URL
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct CDKValidium.BatchData[] batches,
    address l2Coinbase,
    bytes signaturesAndAddrs
  ) external
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct CDKValidium.BatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`l2Coinbase` | address | Address that will receive the fees from L2
|`signaturesAndAddrs` | bytes | Byte array containing the signatures and all the addresses of the committee in ascending order
[signature 0, ..., signature requiredAmountOfSignatures -1, address 0, ... address N]
note that each ECDSA signatures are used, therefore each one must be 65 bytes

### verifyBatches
```solidity
  function verifyBatches(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### verifyBatchesTrustedAggregator
```solidity
  function verifyBatchesTrustedAggregator(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### _verifyAndRewardBatches
```solidity
  function _verifyAndRewardBatches(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) internal
```
Verify and reward batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### _tryConsolidatePendingState
```solidity
  function _tryConsolidatePendingState(
  ) internal
```
Internal function to consolidate the state automatically once sequence or verify batches are called
It tries to consolidate the first and the middle pending state in the queue



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
Function to update the batch fee based on the new verified batches
The batch fee will not be updated when the trusted aggregator verifies batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newLastVerifiedBatch` | uint64 | New last verified batch

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 maticAmount
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
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct CDKValidium.ForcedBatchData[] batches
  ) external
```
Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct CDKValidium.ForcedBatchData[] | Struct array which holds the necessary data to append force batches

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
|`newTrustedSequencer` | address | Address of the new trusted sequencer

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
Allow the admin to set a new pending state timeout
The timeout can only be lowered, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedAggregatorTimeout` | uint64 | Trusted aggregator timeout

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
|`newPendingStateTimeout` | uint64 | Trusted aggregator timeout

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
|`newMultiplierBatchFee` | uint16 | multiplier batch fee

### setVerifyBatchTimeTarget
```solidity
  function setVerifyBatchTimeTarget(
    uint64 newVerifyBatchTimeTarget
  ) external
```
Allow the admin to set a new verify batch time target
This value will only be relevant once the aggregation is decentralized, so
the trustedAggregatorTimeout should be zero or very close to zero


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifyBatchTimeTarget` | uint64 | Verify batch time target

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

### activateForceBatches
```solidity
  function activateForceBatches(
  ) external
```
Allow the admin to turn on the force batches
This action is not reversible



### transferAdminRole
```solidity
  function transferAdminRole(
    address newPendingAdmin
  ) external
```
Starts the admin role transfer
This is a two step process, the pending admin must accepted to finalize the process


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingAdmin` | address | Address of the new pending admin

### acceptAdminRole
```solidity
  function acceptAdminRole(
  ) external
```
Allow the current pending admin to accept the admin role



### overridePendingState
```solidity
  function overridePendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) external
```
Allows the trusted aggregator to override the pending state
if it's possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) external
```
Allows to halt the CDKValidium if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### _proveDistinctPendingState
```solidity
  function _proveDistinctPendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) internal
```
Internal function that proves a different state root given the same batches to verify


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | fflonk proof

### activateEmergencyState
```solidity
  function activateEmergencyState(
    uint64 sequencedBatchNum
  ) external
```
Function to activate emergency state, which also enables the emergency mode on both CDKValidium and PolygonZkEVMBridge contracts
If not called by the owner must be provided a batcnNum that does not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`sequencedBatchNum` | uint64 | Sequenced batch number that has not been aggreagated in _HALT_AGGREGATION_TIMEOUT

### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate emergency state on both CDKValidium and PolygonZkEVMBridge contracts



### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both CDKValidium and PolygonZkEVMBridge contracts



### getForcedBatchFee
```solidity
  function getForcedBatchFee(
  ) public returns (uint256)
```
Get forced batch fee



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
Note that his function does not check if the pending state currently exists, or if it's consolidated already



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
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### checkStateRootInsidePrime
```solidity
  function checkStateRootInsidePrime(
  ) public returns (bool)
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

### VerifyBatches
```solidity
  event VerifyBatches(
  )
```

Emitted when a aggregator verifies batches

### VerifyBatchesTrustedAggregator
```solidity
  event VerifyBatchesTrustedAggregator(
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

Emitted when the admin updates the trusted sequencer address

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when the admin updates the sequencer URL

### SetTrustedAggregatorTimeout
```solidity
  event SetTrustedAggregatorTimeout(
  )
```

Emitted when the admin updates the trusted aggregator timeout

### SetPendingStateTimeout
```solidity
  event SetPendingStateTimeout(
  )
```

Emitted when the admin updates the pending state timeout

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when the admin updates the trusted aggregator address

### SetMultiplierBatchFee
```solidity
  event SetMultiplierBatchFee(
  )
```

Emitted when the admin updates the multiplier batch fee

### SetVerifyBatchTimeTarget
```solidity
  event SetVerifyBatchTimeTarget(
  )
```

Emitted when the admin updates the verify batch timeout

### SetForceBatchTimeout
```solidity
  event SetForceBatchTimeout(
  )
```

Emitted when the admin update the force batch timeout

### ActivateForceBatches
```solidity
  event ActivateForceBatches(
  )
```

Emitted when activate force batches

### TransferAdminRole
```solidity
  event TransferAdminRole(
  )
```

Emitted when the admin starts the two-step transfer role setting a new pending admin

### AcceptAdminRole
```solidity
  event AcceptAdminRole(
  )
```

Emitted when the pending admin accepts the admin role

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

### UpdateZkEVMVersion
```solidity
  event UpdateZkEVMVersion(
  )
```

Emitted everytime the forkID is updated, this includes the first initialization of the contract
This event is intended to be emitted for every upgrade of the contract with relevant changes for the nodes

