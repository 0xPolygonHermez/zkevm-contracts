Contract responsible for managing the exit roots across multiple Rollups


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IPolygonZkEVMBridge _bridgeAddress
  ) internal
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address

### initialize
```solidity
  function initialize(
  ) external
```




### addNewConsensus
```solidity
  function addNewConsensus(
    address newConsensusAddress,
    string description
  ) external
```
Add a new consensus implementation contract
This contract will be used as base for the new created Rollups


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newConsensusAddress` | address | new exit tree root
|`description` | string | description of the consensus

### addNewVerifier
```solidity
  function addNewVerifier(
    address newVerifierAddress
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifierAddress` | address | new verifier address

### deleteConsensus
```solidity
  function deleteConsensus(
    address consensusAddress
  ) external
```
Delete Conensus


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`consensusAddress` | address | Consensus address to delete

### deleteVerifier
```solidity
  function deleteVerifier(
    address verifierAddress
  ) external
```
Delete Verifier


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`verifierAddress` | address | Verifier address to delete

### createNewRollup
```solidity
  function createNewRollup(
    address consensusAddress,
    address verifierAddress,
    uint64 _admin,
    address _trustedSequencer,
    address _feeToken,
    contract IERC20Upgradeable _trustedSequencerURL,
    string _networkName,
    string _version
  ) external
```
Create a new rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`consensusAddress` | address | consensus implementation address
|`verifierAddress` | address | chainID
|`_admin` | uint64 | admin of the new created rollup
|`_trustedSequencer` | address | trusted sequencer of the new created rollup
|`_feeToken` | address | fee token of the new created rollup
|`_trustedSequencerURL` | contract IERC20Upgradeable | trusted sequencer URL of the new created rollup
|`_networkName` | string | network name of the new created rollup
|`_version` | string | version string of the new created rollup

### addExistingRollup
```solidity
  function addExistingRollup(
    address rollupAddress,
    address verifierAddress,
    uint64 chainID
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | address | rollup address
|`verifierAddress` | address | verifier address, must be added before
|`chainID` | uint64 | chain id of the created rollup

### upgradeRollupImplementation
```solidity
  function upgradeRollupImplementation(
    contract TransparentUpgradeableProxy rollupAddress,
    address newConsensusAddress,
    bytes upgradeData
  ) external
```
Upgrade an existing rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract TransparentUpgradeableProxy | Rollup consensus proxy address
|`newConsensusAddress` | address | new implementation of the consensus
|`upgradeData` | bytes | Upgrade data

### upgradeRollupVerifier
```solidity
  function upgradeRollupVerifier(
    address newVerifierAddress
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifierAddress` | address | new verifier address

### getRollupExitRoot
```solidity
  function getRollupExitRoot(
  ) public returns (bytes32)
```
get the current rollup exit root



### onSequenceBatches
```solidity
  function onSequenceBatches(
    uint64 newSequencedBatch,
    bytes32 newAccInputHash
  ) external
```
Sequence batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newSequencedBatch` | uint64 | new sequenced batch
|`newAccInputHash` | bytes32 | new accumualted input hash

### verifyBatches
```solidity
  function verifyBatches(
    uint64 pendingStateNum,
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
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### verifyBatchesTrustedAggregator
```solidity
  function verifyBatchesTrustedAggregator(
    uint64 pendingStateNum,
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
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
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
    uint64 initPendingStateNum,
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
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
|`finalPendingStateNum` | uint64 | Final pending state, that will be used to compare with the newStateRoot
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | uint64 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`proof` | bytes32 | fflonk proof

### proveNonDeterministicPendingState
```solidity
  function proveNonDeterministicPendingState(
    uint64 initPendingStateNum,
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
|`initPendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used
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

### activateEmergencyState
```solidity
  function activateEmergencyState(
    uint64 sequencedBatchNum
  ) external
```
Function to activate emergency state, which also enables the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contracts
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

### transferGovernanceRole
```solidity
  function transferGovernanceRole(
    address newPendingGovernance
  ) external
```
Starts the Governance role transfer
This is a two step process, the pending Governance must accepted to finalize the process


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingGovernance` | address | Address of the new pending Governance

### acceptGovernanceRole
```solidity
  function acceptGovernanceRole(
  ) external
```
Allow the current pending Governance to accept the Governance role



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



### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
    uint64 initNumBatch,
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
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
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

### checkStateRootInsidePrime
```solidity
  function checkStateRootInsidePrime(
  ) public returns (bool)
```




## Events
### AddNewConsensus
```solidity
  event AddNewConsensus(
  )
```

Emitted when a new consensus is added

### AddNewVerifier
```solidity
  event AddNewVerifier(
  )
```

Emitted when a new consensus is added

### DeleteConsensus
```solidity
  event DeleteConsensus(
  )
```

Emitted when a new verifier is added

### DeleteVerifier
```solidity
  event DeleteVerifier(
  )
```

Emitted when a new verifier is added

### AddNewRollup
```solidity
  event AddNewRollup(
  )
```

Emitted when a new verifier is added

### RollupUpgraded
```solidity
  event RollupUpgraded(
  )
```

Emitted when a new verifier is added

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

### TransferGovernanceRole
```solidity
  event TransferGovernanceRole(
  )
```

Emitted when the governance starts the two-step transfer role setting a new pending governance

### AcceptGovernanceRole
```solidity
  event AcceptGovernanceRole(
  )
```

Emitted when the pending Governance accepts the Governance role

