Contract responsible for managing the exit roots across multiple Rollups


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IPolygonZkEVMBridge _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address

### initialize
```solidity
  function initialize(
  ) external
```




### addNewRollupType
```solidity
  function addNewRollupType(
    address consensusImplementation,
    contract IVerifierRollup verifier,
    uint64 forkID,
    bytes32 genesis,
    uint8 description
  ) external
```
Add a new zkEVM type


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`consensusImplementation` | address | new consensus implementation
|`verifier` | contract IVerifierRollup | new verifier address
|`forkID` | uint64 | forkID of the verifier
|`genesis` | bytes32 | genesis block of the zkEVM
|`description` | uint8 | description of the zkEVM type

### obsoleteRollupType
```solidity
  function obsoleteRollupType(
    uint32 rollupTypeID
  ) external
```
Obsolete Rollup type


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Consensus address to obsolete

### createNewRollup
```solidity
  function createNewRollup(
    uint32 rollupTypeID,
    uint64 chainID,
    address admin,
    address trustedSequencer,
    address trustedSequencerURL,
    uint32 networkName
  ) external
```
Create a new rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Rollup type to deploy
|`chainID` | uint64 | chainID
|`admin` | address | admin of the new created rollup
|`trustedSequencer` | address | trusted sequencer of the new created rollup
|`trustedSequencerURL` | address | trusted sequencer URL of the new created rollup
|`networkName` | uint32 | network name of the new created rollup

### addExistingRollup
```solidity
  function addExistingRollup(
    contract IPolygonRollupBase rollupAddress,
    contract IVerifierRollup verifier,
    uint64 forkID,
    uint64 chainID,
    bytes32 genesis,
    uint8 rollupCompatibilityID
  ) external
```
Add an already deployed rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | rollup address
|`verifier` | contract IVerifierRollup | verifier address, must be added before
|`forkID` | uint64 | chain id of the created rollup
|`chainID` | uint64 | chain id of the created rollup
|`genesis` | bytes32 | chain id of the created rollup
|`rollupCompatibilityID` | uint8 | chain id of the created rollup

### _addExistingRollup
```solidity
  function _addExistingRollup(
    contract IPolygonRollupBase rollupAddress,
    contract IVerifierRollup verifier,
    uint64 forkID,
    uint64 chainID,
    uint8 rollupCompatibilityID
  ) internal returns (struct PolygonRollupManager.RollupData rollup)
```
Add an already deployed rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | rollup address
|`verifier` | contract IVerifierRollup | verifier address, must be added before
|`forkID` | uint64 | chain id of the created rollup
|`chainID` | uint64 | chain id of the created rollup
|`rollupCompatibilityID` | uint8 | chain id of the created rollup

### updateRollup
```solidity
  function updateRollup(
    contract TransparentUpgradeableProxy rollupContract,
    uint32 newRollupTypeID,
    bytes upgradeData
  ) external
```
Upgrade an existing rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract TransparentUpgradeableProxy | Rollup consensus proxy address
|`newRollupTypeID` | uint32 | New rolluptypeID to upgrade to
|`upgradeData` | bytes | Upgrade data

### onSequenceBatches
```solidity
  function onSequenceBatches(
    uint64 newSequencedBatches,
    uint64 forcedSequencedBatches,
    bytes32 newAccInputHash
  ) external returns (uint64)
```
Sequence batches, callback called by one of the consensus managed by this contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newSequencedBatches` | uint64 | how many sequenced batches were sequenced
|`forcedSequencedBatches` | uint64 | how many forced batches were sequenced
|`newAccInputHash` | bytes32 | new accumualted input hash

### verifyBatches
```solidity
  function verifyBatches(
    uint32 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint32 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### verifyBatchesTrustedAggregator
```solidity
  function verifyBatchesTrustedAggregator(
    uint32 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint32 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### _verifyAndRewardBatches
```solidity
  function _verifyAndRewardBatches(
    struct PolygonRollupManager.RollupData pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) internal
```
Verify and reward batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | struct PolygonRollupManager.RollupData | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

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
    uint32 pendingStateNum
  ) external
```
Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | uint32 | Pending state to consolidate

### _consolidatePendingState
```solidity
  function _consolidatePendingState(
    struct PolygonRollupManager.RollupData pendingStateNum
  ) internal
```
Internal function to consolidate any pending state that has already exceed the pendingStateTimeout


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`pendingStateNum` | struct PolygonRollupManager.RollupData | Pending state to consolidate

### overridePendingState
```solidity
  function overridePendingState(
    uint32 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) external
```
Allows the trusted aggregator to override the pending state
if it's possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint32 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint32 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) external
```
Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | uint32 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### _proveDistinctPendingState
```solidity
  function _proveDistinctPendingState(
    struct PolygonRollupManager.RollupData initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32 proof
  ) internal
```
Internal function that proves a different state root given the same batches to verify


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initPendingStateNum` | struct PolygonRollupManager.RollupData | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### _updateBatchFee
```solidity
  function _updateBatchFee(
    struct PolygonRollupManager.RollupData newLastVerifiedBatch
  ) internal
```
Function to update the batch fee based on the new verified batches
The batch fee will not be updated when the trusted aggregator verifies batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newLastVerifiedBatch` | struct PolygonRollupManager.RollupData | New last verified batch

### activateEmergencyState
```solidity
  function activateEmergencyState(
  ) external
```
Function to activate emergency state, which also enables the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contracts
If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period



### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts



### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts



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

### setBatchFee
```solidity
  function setBatchFee(
    uint256 newBatchFee
  ) external
```
Allow to corresponding role to set the current batch fee


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newBatchFee` | uint256 | new batch fee

### getRollupExitRoot
```solidity
  function getRollupExitRoot(
  ) public returns (bytes32)
```
Get the current rollup exit root
Compute using all the local exit roots of all rollups the rollup exit root
Since it's expected to have no more than 10 rollups in this first version, even if this approach
has a gas consumption that scales linearly with the rollups added, it's ok
In a future versions this computation will be done inside the circuit



### getLastVerifiedBatch
```solidity
  function getLastVerifiedBatch(
  ) public returns (uint64)
```
Get the last verified batch



### _getLastVerifiedBatch
```solidity
  function _getLastVerifiedBatch(
  ) internal returns (uint64)
```
Get the last verified batch



### isPendingStateConsolidable
```solidity
  function isPendingStateConsolidable(
  ) public returns (bool)
```
Returns a boolean that indicates if the pendingStateNum is or not consolidable
Note that his function does not check if the pending state currently exists, or if it's consolidated already



### _isPendingStateConsolidable
```solidity
  function _isPendingStateConsolidable(
  ) internal returns (bool)
```
Returns a boolean that indicates if the pendingStateNum is or not consolidable
Note that his function does not check if the pending state currently exists, or if it's consolidated already



### calculateRewardPerBatch
```solidity
  function calculateRewardPerBatch(
  ) public returns (uint256)
```
Function to calculate the reward to verify a single batch



### getBatchFee
```solidity
  function getBatchFee(
  ) public returns (uint256)
```
Get batch fee



### getForcedBatchFee
```solidity
  function getForcedBatchFee(
  ) public returns (uint256)
```
Get forced batch fee



### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
    uint32 initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) public returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | uint32 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _getInputSnarkBytes
```solidity
  function _getInputSnarkBytes(
    struct PolygonRollupManager.RollupData initNumBatch,
    uint64 finalNewBatch,
    uint64 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) internal returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`initNumBatch` | struct PolygonRollupManager.RollupData | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _checkStateRootInsidePrime
```solidity
  function _checkStateRootInsidePrime(
  ) internal returns (bool)
```




## Events
### AddNewRollupType
```solidity
  event AddNewRollupType(
  )
```

Emitted when a new rollup type is added

### DeleteRollupType
```solidity
  event DeleteRollupType(
  )
```

Emitted when a a rolup type is deleted

### CreateNewRollup
```solidity
  event CreateNewRollup(
  )
```

Emitted when a new rollup is created based on a rollupType

### AddExistingRollup
```solidity
  event AddExistingRollup(
  )
```

Emitted when an existing rollup is added

### UpdateRollup
```solidity
  event UpdateRollup(
  )
```

Emitted when a rollup is udpated

### OnSequenceBatches
```solidity
  event OnSequenceBatches(
  )
```

Emitted when a new verifier is added

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

Emitted when a aggregator verifies batches

### ConsolidatePendingState
```solidity
  event ConsolidatePendingState(
  )
```

Emitted when pending state is consolidated

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

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when the admin updates the trusted aggregator address

### SetBatchFee
```solidity
  event SetBatchFee(
  )
```

Emitted when the batch fee is set

