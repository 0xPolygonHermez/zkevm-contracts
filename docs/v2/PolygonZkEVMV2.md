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
    contract IVerifierRollup _rollupVerifier,
    contract PolygonRollupManager _rollupManager
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_rollupVerifier` | contract IVerifierRollup | Rollup verifier address
|`_rollupManager` | contract PolygonRollupManager | Global exit root manager address

### initialize
```solidity
  function initialize(
    address _admin,
    address _trustedSequencer,
    contract IERC20Upgradeable _feeToken,
    string _trustedSequencerURL,
    string _networkName,
    string _version
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_admin` | address | Admin address
|`_trustedSequencer` | address | Trusted sequencer address
|`_feeToken` | contract IERC20Upgradeable | Fee token
|`_trustedSequencerURL` | string | Trusted sequencer URL
|`_networkName` | string | L2 network name
|`_version` | string | version

### sequenceBatches
```solidity
  function sequenceBatches(
    struct PolygonZkEVMV2.BatchData[] batches,
    address l2Coinbase
  ) external
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonZkEVMV2.BatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`l2Coinbase` | address | Address that will receive the fees from L2

### verifyAndRewardBatches
```solidity
  function verifyAndRewardBatches(
    address beneficiary,
    uint64 batchesToReward
  ) public
```
Reward batches, can only be called by the rollup manager


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`beneficiary` | address | Addres htat will receive the fees
|`batchesToReward` | uint64 | Batches to reward

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
    uint256 feeTokenAmount
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
|`feeTokenAmount` | uint256 | Max amount of feeToken tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct PolygonZkEVMV2.BatchData[] batches
  ) external
```
Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonZkEVMV2.BatchData[] | Struct array which holds the necessary data to append force batches

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



### getForcedBatchFee
```solidity
  function getForcedBatchFee(
  ) public returns (uint256)
```
Get forced batch fee



### calculateRewardPerBatch
```solidity
  function calculateRewardPerBatch(
  ) public returns (uint256)
```
Function to calculate the reward to verify a single batch



### getLastVerifiedBatch
```solidity
  function getLastVerifiedBatch(
  ) public returns (uint64)
```
Get the last verified batch



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

