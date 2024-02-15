Contract responsible for managing rollups and the verification of their batches.
This contract will create and update rollups and store all the hashed sequenced data from them.
The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridge _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRootV2 | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address

### initialize
```solidity
  function initialize(
    address trustedAggregator,
    uint64 _pendingStateTimeout,
    uint64 _trustedAggregatorTimeout,
    address admin,
    address timelock,
    address emergencyCouncil,
    contract PolygonZkEVMExistentEtrog polygonZkEVM,
    contract IVerifierRollup zkEVMVerifier,
    uint64 zkEVMForkID,
    uint64 zkEVMChainID
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`trustedAggregator` | address | Trusted aggregator address
|`_pendingStateTimeout` | uint64 | Pending state timeout
|`_trustedAggregatorTimeout` | uint64 | Trusted aggregator timeout
|`admin` | address | Admin of the rollup manager
|`timelock` | address | Timelock address
|`emergencyCouncil` | address | Emergency council address
|`polygonZkEVM` | contract PolygonZkEVMExistentEtrog | New deployed Polygon zkEVM which will be initialized wiht previous values
|`zkEVMVerifier` | contract IVerifierRollup | Verifier of the new zkEVM deployed
|`zkEVMForkID` | uint64 | Fork id of the new zkEVM deployed
|`zkEVMChainID` | uint64 | Chain id of the new zkEVM deployed

### addNewRollupType
```solidity
  function addNewRollupType(
    address consensusImplementation,
    contract IVerifierRollup verifier,
    uint64 forkID,
    uint8 genesis,
    bytes32 description
  ) external
```
Add a new rollup type


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`consensusImplementation` | address | Consensus implementation
|`verifier` | contract IVerifierRollup | Verifier address
|`forkID` | uint64 | ForkID of the verifier
|`genesis` | uint8 | Genesis block of the rollup
|`description` | bytes32 | Description of the rollup type

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
|`rollupTypeID` | uint32 | Rollup type to obsolete

### createNewRollup
```solidity
  function createNewRollup(
    uint32 rollupTypeID,
    uint64 chainID,
    address admin,
    address sequencer,
    address gasTokenAddress,
    string sequencerURL,
    string networkName
  ) external
```
Create a new rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Rollup type to deploy
|`chainID` | uint64 | ChainID of the rollup, must be a new one
|`admin` | address | Admin of the new created rollup
|`sequencer` | address | Sequencer of the new created rollup
|`gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
Note if a wrapped token of the bridge is used, the original network and address of this wrapped will be used instead
|`sequencerURL` | string | Sequencer URL of the new created rollup
|`networkName` | string | Network name of the new created rollup

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
note that this rollup does not follow any rollupType


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | Rollup address
|`verifier` | contract IVerifierRollup | Verifier address, must be added before
|`forkID` | uint64 | Fork id of the added rollup
|`chainID` | uint64 | Chain id of the added rollup
|`genesis` | bytes32 | Genesis block for this rollup
|`rollupCompatibilityID` | uint8 | Compatibility ID for the added rollup

### _addExistingRollup
```solidity
  function _addExistingRollup(
    contract IPolygonRollupBase rollupAddress,
    contract IVerifierRollup verifier,
    uint64 forkID,
    uint64 chainID,
    uint8 rollupCompatibilityID,
    uint64 lastVerifiedBatch
  ) internal returns (struct PolygonRollupManager.RollupData rollup)
```
Add an already deployed rollup
note that this rollup does not follow any rollupType


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | Rollup address
|`verifier` | contract IVerifierRollup | Verifier address, must be added before
|`forkID` | uint64 | Fork id of the added rollup
|`chainID` | uint64 | Chain id of the added rollup
|`rollupCompatibilityID` | uint8 | Compatibility ID for the added rollup
|`lastVerifiedBatch` | uint64 | Last verified batch before adding the rollup

### updateRollup
```solidity
  function updateRollup(
    contract ITransparentUpgradeableProxy rollupContract,
    uint32 newRollupTypeID,
    bytes upgradeData
  ) external
```
Upgrade an existing rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract ITransparentUpgradeableProxy | Rollup consensus proxy address
|`newRollupTypeID` | uint32 | New rolluptypeID to upgrade to
|`upgradeData` | bytes | Upgrade data

### onSequenceBatches
```solidity
  function onSequenceBatches(
    uint64 newSequencedBatches,
    bytes32 newAccInputHash
  ) external returns (uint64)
```
Sequence batches, callback called by one of the consensus managed by this contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newSequencedBatches` | uint64 | Number of batches sequenced
|`newAccInputHash` | bytes32 | New accumulate input hash

### verifyBatches
```solidity
  function verifyBatches(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] proof
  ) external
```
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | Fflonk proof

### verifyBatchesTrustedAggregator
```solidity
  function verifyBatchesTrustedAggregator(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] proof
  ) external
```
Allows a trusted aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | Fflonk proof

### _verifyAndRewardBatches
```solidity
  function _verifyAndRewardBatches(
    struct PolygonRollupManager.RollupData rollup,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] proof
  ) internal
```
Verify and reward batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup Data storage pointer that will be used to the verification
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | Fflonk proof

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
    uint32 rollupID,
    uint64 pendingStateNum
  ) external
```
Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`pendingStateNum` | uint64 | Pending state to consolidate

### _consolidatePendingState
```solidity
  function _consolidatePendingState(
    struct PolygonRollupManager.RollupData rollup,
    uint64 pendingStateNum
  ) internal
```
Internal function to consolidate any pending state that has already exceed the pendingStateTimeout


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup data storage pointer
|`pendingStateNum` | uint64 | Pending state to consolidate

### overridePendingState
```solidity
  function overridePendingState(
    uint32 rollupID,
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
|`rollupID` | uint32 | Rollup identifier
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | Fflonk proof

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint32 rollupID,
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] proof
  ) external
```
Allows activate the emergency state if its possible to prove a different state root given the same batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | Fflonk proof

### _proveDistinctPendingState
```solidity
  function _proveDistinctPendingState(
    struct PolygonRollupManager.RollupData rollup,
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
|`rollup` | struct PolygonRollupManager.RollupData | Rollup Data struct that will be checked
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32[24] | Fflonk proof

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
Function to activate emergency state, which also enables the emergency mode on both PolygonRollupManager and PolygonZkEVMBridge contracts
If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period and an emergency state was not happened in the same period



### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts



### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts



### setTrustedAggregatorTimeout
```solidity
  function setTrustedAggregatorTimeout(
    uint64 newTrustedAggregatorTimeout
  ) external
```
Set a new pending state timeout
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
Set a new trusted aggregator timeout
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
Set a new multiplier batch fee


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
Set a new verify batch time target
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
Set the current batch fee


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
    uint32 rollupID,
    uint64 pendingStateNum
  ) public returns (bool)
```
Returns a boolean that indicates if the pendingStateNum is or not consolidable


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup id
|`pendingStateNum` | uint64 | Pending state number to check
Note that his function does not check if the pending state currently exists, or if it's consolidated already

### _isPendingStateConsolidable
```solidity
  function _isPendingStateConsolidable(
    struct PolygonRollupManager.RollupData rollup,
    uint64 pendingStateNum
  ) internal returns (bool)
```
Returns a boolean that indicates if the pendingStateNum is or not consolidable


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup data storage pointer
|`pendingStateNum` | uint64 | Pending state number to check
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
This function is used instad of the automatic public view one,
because in a future might change the behaviour and we will be able to mantain the interface



### getForcedBatchFee
```solidity
  function getForcedBatchFee(
  ) public returns (uint256)
```
Get forced batch fee



### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
    uint32 rollupID,
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
|`rollupID` | uint32 | Rollup id used to calculate the input snark bytes
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _getInputSnarkBytes
```solidity
  function _getInputSnarkBytes(
    struct PolygonRollupManager.RollupData rollup,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) internal returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup data storage pointer
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _checkStateRootInsidePrime
```solidity
  function _checkStateRootInsidePrime(
    uint256 newStateRoot
  ) internal returns (bool)
```
Function to check if the state root is inside of the prime field


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newStateRoot` | uint256 | New State root once the batch is processed

### getRollupBatchNumToStateRoot
```solidity
  function getRollupBatchNumToStateRoot(
    uint32 rollupID,
    uint64 batchNum
  ) public returns (bytes32)
```
Get rollup state root given a batch number


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`batchNum` | uint64 | Batch number

### getRollupSequencedBatches
```solidity
  function getRollupSequencedBatches(
    uint32 rollupID,
    uint64 batchNum
  ) public returns (struct LegacyZKEVMStateVariables.SequencedBatchData)
```
Get rollup sequence batches struct given a batch number


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`batchNum` | uint64 | Batch number

### getRollupPendingStateTransitions
```solidity
  function getRollupPendingStateTransitions(
    uint32 rollupID,
    uint64 batchNum
  ) public returns (struct LegacyZKEVMStateVariables.PendingState)
```
Get rollup sequence pending state struct given a batch number


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`batchNum` | uint64 | Batch number

## Events
### AddNewRollupType
```solidity
  event AddNewRollupType(
  )
```

Emitted when a new rollup type is added

### ObsoleteRollupType
```solidity
  event ObsoleteRollupType(
  )
```

Emitted when a a rolup type is obsoleted

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

Emitted when an aggregator verifies batches

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

Emitted when is updated the trusted aggregator timeout

### SetPendingStateTimeout
```solidity
  event SetPendingStateTimeout(
  )
```

Emitted when is updated the pending state timeout

### SetMultiplierBatchFee
```solidity
  event SetMultiplierBatchFee(
  )
```

Emitted when is updated the multiplier batch fee

### SetVerifyBatchTimeTarget
```solidity
  event SetVerifyBatchTimeTarget(
  )
```

Emitted when is updated the verify batch timeout

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when is updated the trusted aggregator address

### SetBatchFee
```solidity
  event SetBatchFee(
  )
```

Emitted when is updated the batch fee

