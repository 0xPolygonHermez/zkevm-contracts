Contract responsible for managing the exit roots across multiple Rollups


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridge _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | MATIC token address
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
    contract PolygonZkEVMV2Existent polygonZkEVM,
    contract IVerifierRollup zkEVMVerifier
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`trustedAggregator` | address | Trusted aggregatot address
|`_pendingStateTimeout` | uint64 | Pending state timeout
|`_trustedAggregatorTimeout` | uint64 | Trusted aggregator timeout
|`admin` | address | Admin of the rollup manager
|`timelock` | address | Timelock address
|`emergencyCouncil` | address | Emergency council address
|`polygonZkEVM` | contract PolygonZkEVMV2Existent | New deployed Polygon zkEVM which will be initialized wiht previous values
|`zkEVMVerifier` | contract IVerifierRollup | Verifier of the new zkEVM deployed

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
|`consensusImplementation` | address | consensus implementation
|`verifier` | contract IVerifierRollup | verifier address
|`forkID` | uint64 | forkID of the verifier
|`genesis` | uint8 | genesis block of the rollup
|`description` | bytes32 | description of the rollup type

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
    uint32 gasTokenNetwork,
    string sequencerURL,
    string networkName
  ) external
```
Create a new rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Rollup type to deploy
|`chainID` | uint64 | chainID of the rollup, must be a new one
|`admin` | address | admin of the new created rollup
|`sequencer` | address | sequencer of the new created rollup
|`gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
|`gasTokenNetwork` | uint32 | Indicates the native network of the token address
|`sequencerURL` | string | sequencer URL of the new created rollup
|`networkName` | string | network name of the new created rollup

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
|`rollupAddress` | contract IPolygonRollupBase | rollup address
|`verifier` | contract IVerifierRollup | verifier address, must be added before
|`forkID` | uint64 | fork id of the added rollup
|`chainID` | uint64 | chain id of the added rollup
|`genesis` | bytes32 | genesis block for this rollup
|`rollupCompatibilityID` | uint8 | compatibility ID for the added rollup

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
note that this rollup does not follow any rollupType


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | rollup address
|`verifier` | contract IVerifierRollup | verifier address, must be added before
|`forkID` | uint64 | fork id of the added rollup
|`chainID` | uint64 | chain id of the added rollup
|`rollupCompatibilityID` | uint8 | compatibility ID for the added rollup

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
|`newSequencedBatches` | uint64 | how many sequenced batches were sequenced
|`newAccInputHash` | bytes32 | new accumualted input hash

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
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | fflonk proof

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
Allows an aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | fflonk proof

### _verifyAndRewardBatches
```solidity
  function _verifyAndRewardBatches(
    struct PolygonRollupManager.RollupData rollup,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address proof
  ) internal
```
Verify and reward batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup Data struct that will be used to the verification
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | address | fflonk proof

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
|`proof` | bytes32[24] | fflonk proof

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
Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches


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
|`proof` | bytes32[24] | fflonk proof

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
|`proof` | bytes32[24] | fflonk proof

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




### getRollupBatchNumToStateRoot
```solidity
  function getRollupBatchNumToStateRoot(
  ) public returns (bytes32)
```
Get the last verified batch



### getRollupSequencedBatches
```solidity
  function getRollupSequencedBatches(
  ) public returns (struct LegacyZKEVMStateVariables.SequencedBatchData)
```
Get the last verified batch



### getRollupPendingStateTransitions
```solidity
  function getRollupPendingStateTransitions(
  ) public returns (struct LegacyZKEVMStateVariables.PendingState)
```
Get the last verified batch



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

