# PolygonRollupManagerPrevious
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/PolygonRollupManagerPrevious.sol)

**Inherits:**
[PolygonAccessControlUpgradeable](/contracts/v2/lib/PolygonAccessControlUpgradeable.sol/abstract.PolygonAccessControlUpgradeable.md), [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [LegacyZKEVMStateVariables](/contracts/v2/lib/LegacyZKEVMStateVariables.sol/contract.LegacyZKEVMStateVariables.md), [PolygonConstantsBase](/contracts/v2/lib/PolygonConstantsBase.sol/contract.PolygonConstantsBase.md), [IPolygonRollupManagerPrevious](/contracts/v2/previousVersions/IPolygonRollupManagerPrevious.sol/interface.IPolygonRollupManagerPrevious.md)

Contract responsible for managing rollups and the verification of their batches.
This contract will create and update rollups and store all the hashed sequenced data from them.
The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.


## State Variables
### _RFIELD

```solidity
uint256 internal constant _RFIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
```


### _MAX_BATCH_MULTIPLIER

```solidity
uint256 internal constant _MAX_BATCH_MULTIPLIER = 12;
```


### _MAX_BATCH_FEE

```solidity
uint256 internal constant _MAX_BATCH_FEE = 1000 ether;
```


### _MIN_BATCH_FEE

```solidity
uint256 internal constant _MIN_BATCH_FEE = 1 gwei;
```


### _GOLDILOCKS_PRIME_FIELD

```solidity
uint256 internal constant _GOLDILOCKS_PRIME_FIELD = 0xFFFFFFFF00000001;
```


### _MAX_UINT_64

```solidity
uint256 internal constant _MAX_UINT_64 = type(uint64).max;
```


### _EXIT_TREE_DEPTH

```solidity
uint256 internal constant _EXIT_TREE_DEPTH = 32;
```


### _ADD_ROLLUP_TYPE_ROLE

```solidity
bytes32 internal constant _ADD_ROLLUP_TYPE_ROLE = keccak256("ADD_ROLLUP_TYPE_ROLE");
```


### _OBSOLETE_ROLLUP_TYPE_ROLE

```solidity
bytes32 internal constant _OBSOLETE_ROLLUP_TYPE_ROLE = keccak256("OBSOLETE_ROLLUP_TYPE_ROLE");
```


### _CREATE_ROLLUP_ROLE

```solidity
bytes32 internal constant _CREATE_ROLLUP_ROLE = keccak256("CREATE_ROLLUP_ROLE");
```


### _ADD_EXISTING_ROLLUP_ROLE

```solidity
bytes32 internal constant _ADD_EXISTING_ROLLUP_ROLE = keccak256("ADD_EXISTING_ROLLUP_ROLE");
```


### _UPDATE_ROLLUP_ROLE

```solidity
bytes32 internal constant _UPDATE_ROLLUP_ROLE = keccak256("UPDATE_ROLLUP_ROLE");
```


### _TRUSTED_AGGREGATOR_ROLE

```solidity
bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE = keccak256("TRUSTED_AGGREGATOR_ROLE");
```


### _TRUSTED_AGGREGATOR_ROLE_ADMIN

```solidity
bytes32 internal constant _TRUSTED_AGGREGATOR_ROLE_ADMIN = keccak256("TRUSTED_AGGREGATOR_ROLE_ADMIN");
```


### _TWEAK_PARAMETERS_ROLE

```solidity
bytes32 internal constant _TWEAK_PARAMETERS_ROLE = keccak256("TWEAK_PARAMETERS_ROLE");
```


### _SET_FEE_ROLE

```solidity
bytes32 internal constant _SET_FEE_ROLE = keccak256("SET_FEE_ROLE");
```


### _STOP_EMERGENCY_ROLE

```solidity
bytes32 internal constant _STOP_EMERGENCY_ROLE = keccak256("STOP_EMERGENCY_ROLE");
```


### _EMERGENCY_COUNCIL_ROLE

```solidity
bytes32 internal constant _EMERGENCY_COUNCIL_ROLE = keccak256("EMERGENCY_COUNCIL_ROLE");
```


### _EMERGENCY_COUNCIL_ADMIN

```solidity
bytes32 internal constant _EMERGENCY_COUNCIL_ADMIN = keccak256("EMERGENCY_COUNCIL_ADMIN");
```


### globalExitRootManager

```solidity
IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;
```


### bridgeAddress

```solidity
IPolygonZkEVMBridge public immutable bridgeAddress;
```


### pol

```solidity
IERC20Upgradeable public immutable pol;
```


### rollupTypeCount

```solidity
uint32 public rollupTypeCount;
```


### rollupTypeMap

```solidity
mapping(uint32 rollupTypeID => RollupType) public rollupTypeMap;
```


### rollupCount

```solidity
uint32 public rollupCount;
```


### rollupIDToRollupData

```solidity
mapping(uint32 rollupID => RollupData) public rollupIDToRollupData;
```


### rollupAddressToID

```solidity
mapping(address rollupAddress => uint32 rollupID) public rollupAddressToID;
```


### chainIDToRollupID

```solidity
mapping(uint64 chainID => uint32 rollupID) public chainIDToRollupID;
```


### totalSequencedBatches

```solidity
uint64 public totalSequencedBatches;
```


### totalVerifiedBatches

```solidity
uint64 public totalVerifiedBatches;
```


### lastAggregationTimestamp

```solidity
uint64 public lastAggregationTimestamp;
```


### trustedAggregatorTimeout

```solidity
uint64 public trustedAggregatorTimeout;
```


### pendingStateTimeout

```solidity
uint64 public pendingStateTimeout;
```


### verifyBatchTimeTarget

```solidity
uint64 public verifyBatchTimeTarget;
```


### multiplierBatchFee

```solidity
uint16 public multiplierBatchFee;
```


### _batchFee

```solidity
uint256 internal _batchFee;
```


### lastDeactivatedEmergencyStateTimestamp

```solidity
uint64 public lastDeactivatedEmergencyStateTimestamp;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridge _bridgeAddress
);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|


### addNewRollupType

Add a new rollup type


```solidity
function addNewRollupType(
    address consensusImplementation,
    IVerifierRollup verifier,
    uint64 forkID,
    uint8 rollupCompatibilityID,
    bytes32 genesis,
    string memory description
) external onlyRole(_ADD_ROLLUP_TYPE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consensusImplementation`|`address`|Consensus implementation|
|`verifier`|`IVerifierRollup`|Verifier address|
|`forkID`|`uint64`|ForkID of the verifier|
|`rollupCompatibilityID`|`uint8`||
|`genesis`|`bytes32`|Genesis block of the rollup|
|`description`|`string`|Description of the rollup type|


### obsoleteRollupType

Obsolete Rollup type


```solidity
function obsoleteRollupType(uint32 rollupTypeID) external onlyRole(_OBSOLETE_ROLLUP_TYPE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupTypeID`|`uint32`|Rollup type to obsolete|


### createNewRollup

Create a new rollup


```solidity
function createNewRollup(
    uint32 rollupTypeID,
    uint64 chainID,
    address admin,
    address sequencer,
    address gasTokenAddress,
    string memory sequencerURL,
    string memory networkName
) external onlyRole(_CREATE_ROLLUP_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupTypeID`|`uint32`|Rollup type to deploy|
|`chainID`|`uint64`|ChainID of the rollup, must be a new one, can not have more than 32 bits|
|`admin`|`address`|Admin of the new created rollup|
|`sequencer`|`address`|Sequencer of the new created rollup|
|`gasTokenAddress`|`address`|Indicates the token address that will be used to pay gas fees in the new rollup Note if a wrapped token of the bridge is used, the original network and address of this wrapped will be used instead|
|`sequencerURL`|`string`|Sequencer URL of the new created rollup|
|`networkName`|`string`|Network name of the new created rollup|


### addExistingRollup

Add an already deployed rollup
note that this rollup does not follow any rollupType


```solidity
function addExistingRollup(
    IPolygonRollupBase rollupAddress,
    IVerifierRollup verifier,
    uint64 forkID,
    uint64 chainID,
    bytes32 genesis,
    uint8 rollupCompatibilityID
) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupAddress`|`IPolygonRollupBase`|Rollup address|
|`verifier`|`IVerifierRollup`|Verifier address, must be added before|
|`forkID`|`uint64`|Fork id of the added rollup|
|`chainID`|`uint64`|Chain id of the added rollup|
|`genesis`|`bytes32`|Genesis block for this rollup|
|`rollupCompatibilityID`|`uint8`|Compatibility ID for the added rollup|


### _addExistingRollup

Add an already deployed rollup
note that this rollup does not follow any rollupType


```solidity
function _addExistingRollup(
    IPolygonRollupBase rollupAddress,
    IVerifierRollup verifier,
    uint64 forkID,
    uint64 chainID,
    uint8 rollupCompatibilityID
) internal returns (RollupData storage rollup);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupAddress`|`IPolygonRollupBase`|Rollup address|
|`verifier`|`IVerifierRollup`|Verifier address, must be added before|
|`forkID`|`uint64`|Fork id of the added rollup|
|`chainID`|`uint64`|Chain id of the added rollup|
|`rollupCompatibilityID`|`uint8`|Compatibility ID for the added rollup|


### updateRollupByRollupAdmin

Upgrade an existing rollup from the rollup admin address
This address is able to udpate the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE


```solidity
function updateRollupByRollupAdmin(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`ITransparentUpgradeableProxy`|Rollup consensus proxy address|
|`newRollupTypeID`|`uint32`|New rolluptypeID to upgrade to|


### updateRollup

Upgrade an existing rollup


```solidity
function updateRollup(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID, bytes memory upgradeData)
    external
    onlyRole(_UPDATE_ROLLUP_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`ITransparentUpgradeableProxy`|Rollup consensus proxy address|
|`newRollupTypeID`|`uint32`|New rolluptypeID to upgrade to|
|`upgradeData`|`bytes`|Upgrade data|


### _updateRollup

Upgrade an existing rollup


```solidity
function _updateRollup(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID, bytes memory upgradeData)
    internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`ITransparentUpgradeableProxy`|Rollup consensus proxy address|
|`newRollupTypeID`|`uint32`|New rolluptypeID to upgrade to|
|`upgradeData`|`bytes`|Upgrade data|


### rollbackBatches

Rollback batches of the target rollup


```solidity
function rollbackBatches(IPolygonRollupBase rollupContract, uint64 targetBatch) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`IPolygonRollupBase`|Rollup consensus proxy address|
|`targetBatch`|`uint64`|Batch to rollback up to but not including this batch|


### onSequenceBatches

Sequence batches, callback called by one of the consensus managed by this contract


```solidity
function onSequenceBatches(uint64 newSequencedBatches, bytes32 newAccInputHash)
    external
    ifNotEmergencyState
    returns (uint64);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newSequencedBatches`|`uint64`|Number of batches sequenced|
|`newAccInputHash`|`bytes32`|New accumulate input hash|


### verifyBatches

Allows an aggregator to verify multiple batches


```solidity
function verifyBatches(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] calldata proof
) external ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`beneficiary`|`address`|Address that will receive the verification reward|
|`proof`|`bytes32[24]`|Fflonk proof|


### verifyBatchesTrustedAggregator

Allows a trusted aggregator to verify multiple batches


```solidity
function verifyBatchesTrustedAggregator(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] calldata proof
) external onlyRole(_TRUSTED_AGGREGATOR_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`beneficiary`|`address`|Address that will receive the verification reward|
|`proof`|`bytes32[24]`|Fflonk proof|


### _verifyAndRewardBatches

Verify and reward batches internal function


```solidity
function _verifyAndRewardBatches(
    RollupData storage rollup,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] calldata proof
) internal virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`|Rollup Data storage pointer that will be used to the verification|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`beneficiary`|`address`|Address that will receive the verification reward|
|`proof`|`bytes32[24]`|Fflonk proof|


### _tryConsolidatePendingState

Internal function to consolidate the state automatically once sequence or verify batches are called
It tries to consolidate the first and the middle pending state in the queue


```solidity
function _tryConsolidatePendingState(RollupData storage rollup) internal;
```

### consolidatePendingState

Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


```solidity
function consolidatePendingState(uint32 rollupID, uint64 pendingStateNum) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`pendingStateNum`|`uint64`|Pending state to consolidate|


### _consolidatePendingState

Internal function to consolidate any pending state that has already exceed the pendingStateTimeout


```solidity
function _consolidatePendingState(RollupData storage rollup, uint64 pendingStateNum) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`|Rollup data storage pointer|
|`pendingStateNum`|`uint64`|Pending state to consolidate|


### overridePendingState

Allows the trusted aggregator to override the pending state
if it's possible to prove a different state root given the same batches


```solidity
function overridePendingState(
    uint32 rollupID,
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) external onlyRole(_TRUSTED_AGGREGATOR_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|Fflonk proof|


### proveNonDeterministicPendingState

Allows activate the emergency state if its possible to prove a different state root given the same batches


```solidity
function proveNonDeterministicPendingState(
    uint32 rollupID,
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) external ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|Fflonk proof|


### _proveDistinctPendingState

Internal function that proves a different state root given the same batches to verify


```solidity
function _proveDistinctPendingState(
    RollupData storage rollup,
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) internal view virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`|Rollup Data struct that will be checked|
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|Fflonk proof|


### _updateBatchFee

Function to update the batch fee based on the new verified batches
The batch fee will not be updated when the trusted aggregator verifies batches


```solidity
function _updateBatchFee(RollupData storage rollup, uint64 newLastVerifiedBatch) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`||
|`newLastVerifiedBatch`|`uint64`|New last verified batch|


### activateEmergencyState

Function to activate emergency state, which also enables the emergency mode on both PolygonRollupManager and PolygonZkEVMBridge contracts
If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period and an emergency state was not happened in the same period


```solidity
function activateEmergencyState() external;
```

### deactivateEmergencyState

Function to deactivate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts


```solidity
function deactivateEmergencyState() external onlyRole(_STOP_EMERGENCY_ROLE);
```

### _activateEmergencyState

Internal function to activate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts


```solidity
function _activateEmergencyState() internal override;
```

### setTrustedAggregatorTimeout

Set a new pending state timeout
The timeout can only be lowered, except if emergency state is active


```solidity
function setTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout) external onlyRole(_TWEAK_PARAMETERS_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedAggregatorTimeout`|`uint64`|Trusted aggregator timeout|


### setPendingStateTimeout

Set a new trusted aggregator timeout
The timeout can only be lowered, except if emergency state is active


```solidity
function setPendingStateTimeout(uint64 newPendingStateTimeout) external onlyRole(_TWEAK_PARAMETERS_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newPendingStateTimeout`|`uint64`|Trusted aggregator timeout|


### setMultiplierBatchFee

Set a new multiplier batch fee


```solidity
function setMultiplierBatchFee(uint16 newMultiplierBatchFee) external onlyRole(_TWEAK_PARAMETERS_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMultiplierBatchFee`|`uint16`|multiplier batch fee|


### setVerifyBatchTimeTarget

Set a new verify batch time target
This value will only be relevant once the aggregation is decentralized, so
the trustedAggregatorTimeout should be zero or very close to zero


```solidity
function setVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget) external onlyRole(_TWEAK_PARAMETERS_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newVerifyBatchTimeTarget`|`uint64`|Verify batch time target|


### setBatchFee

Set the current batch fee


```solidity
function setBatchFee(uint256 newBatchFee) external onlyRole(_SET_FEE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newBatchFee`|`uint256`|new batch fee|


### getRollupExitRoot

Get the current rollup exit root
Compute using all the local exit roots of all rollups the rollup exit root
Since it's expected to have no more than 10 rollups in this first version, even if this approach
has a gas consumption that scales linearly with the rollups added, it's ok
In a future versions this computation will be done inside the circuit


```solidity
function getRollupExitRoot() public view returns (bytes32);
```

### getLastVerifiedBatch

Get the last verified batch


```solidity
function getLastVerifiedBatch(uint32 rollupID) public view returns (uint64);
```

### _getLastVerifiedBatch

Get the last verified batch


```solidity
function _getLastVerifiedBatch(RollupData storage rollup) internal view returns (uint64);
```

### isPendingStateConsolidable

Returns a boolean that indicates if the pendingStateNum is or not consolidable


```solidity
function isPendingStateConsolidable(uint32 rollupID, uint64 pendingStateNum) public view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup id|
|`pendingStateNum`|`uint64`|Pending state number to check Note that his function does not check if the pending state currently exists, or if it's consolidated already|


### _isPendingStateConsolidable

Returns a boolean that indicates if the pendingStateNum is or not consolidable


```solidity
function _isPendingStateConsolidable(RollupData storage rollup, uint64 pendingStateNum) internal view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`|Rollup data storage pointer|
|`pendingStateNum`|`uint64`|Pending state number to check Note that his function does not check if the pending state currently exists, or if it's consolidated already|


### calculateRewardPerBatch

Function to calculate the reward to verify a single batch


```solidity
function calculateRewardPerBatch() public view returns (uint256);
```

### getBatchFee

Get batch fee
This function is used instad of the automatic public view one,
because in a future might change the behaviour and we will be able to mantain the interface


```solidity
function getBatchFee() public view returns (uint256);
```

### getForcedBatchFee

Get forced batch fee


```solidity
function getForcedBatchFee() public view returns (uint256);
```

### getInputSnarkBytes

Function to calculate the input snark bytes


```solidity
function getInputSnarkBytes(
    uint32 rollupID,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
) public view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup id used to calculate the input snark bytes|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`oldStateRoot`|`bytes32`|State root before batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|


### _getInputSnarkBytes

Function to calculate the input snark bytes


```solidity
function _getInputSnarkBytes(
    RollupData storage rollup,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
) internal view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollup`|`RollupData`|Rollup data storage pointer|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`oldStateRoot`|`bytes32`|State root before batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|


### _checkStateRootInsidePrime

Function to check if the state root is inside of the prime field


```solidity
function _checkStateRootInsidePrime(uint256 newStateRoot) internal pure returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newStateRoot`|`uint256`|New State root once the batch is processed|


### getRollupBatchNumToStateRoot

Get rollup state root given a batch number


```solidity
function getRollupBatchNumToStateRoot(uint32 rollupID, uint64 batchNum) public view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`batchNum`|`uint64`|Batch number|


### getRollupSequencedBatches

Get rollup sequence batches struct given a batch number


```solidity
function getRollupSequencedBatches(uint32 rollupID, uint64 batchNum) public view returns (SequencedBatchData memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`batchNum`|`uint64`|Batch number|


### getRollupPendingStateTransitions

Get rollup sequence pending state struct given a batch number


```solidity
function getRollupPendingStateTransitions(uint32 rollupID, uint64 batchNum) public view returns (PendingState memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`batchNum`|`uint64`|Batch number|


## Events
### AddNewRollupType
*Emitted when a new rollup type is added*


```solidity
event AddNewRollupType(
    uint32 indexed rollupTypeID,
    address consensusImplementation,
    address verifier,
    uint64 forkID,
    uint8 rollupCompatibilityID,
    bytes32 genesis,
    string description
);
```

### ObsoleteRollupType
*Emitted when a a rolup type is obsoleted*


```solidity
event ObsoleteRollupType(uint32 indexed rollupTypeID);
```

### CreateNewRollup
*Emitted when a new rollup is created based on a rollupType*


```solidity
event CreateNewRollup(
    uint32 indexed rollupID, uint32 rollupTypeID, address rollupAddress, uint64 chainID, address gasTokenAddress
);
```

### AddExistingRollup
*Emitted when an existing rollup is added*


```solidity
event AddExistingRollup(
    uint32 indexed rollupID,
    uint64 forkID,
    address rollupAddress,
    uint64 chainID,
    uint8 rollupCompatibilityID,
    uint64 lastVerifiedBatchBeforeUpgrade
);
```

### UpdateRollup
*Emitted when a rollup is udpated*


```solidity
event UpdateRollup(uint32 indexed rollupID, uint32 newRollupTypeID, uint64 lastVerifiedBatchBeforeUpgrade);
```

### OnSequenceBatches
*Emitted when a new verifier is added*


```solidity
event OnSequenceBatches(uint32 indexed rollupID, uint64 lastBatchSequenced);
```

### VerifyBatches
*Emitted when an aggregator verifies batches*


```solidity
event VerifyBatches(
    uint32 indexed rollupID, uint64 numBatch, bytes32 stateRoot, bytes32 exitRoot, address indexed aggregator
);
```

### VerifyBatchesTrustedAggregator
*Emitted when the trusted aggregator verifies batches*


```solidity
event VerifyBatchesTrustedAggregator(
    uint32 indexed rollupID, uint64 numBatch, bytes32 stateRoot, bytes32 exitRoot, address indexed aggregator
);
```

### ConsolidatePendingState
*Emitted when pending state is consolidated*


```solidity
event ConsolidatePendingState(
    uint32 indexed rollupID, uint64 numBatch, bytes32 stateRoot, bytes32 exitRoot, uint64 pendingStateNum
);
```

### ProveNonDeterministicPendingState
*Emitted when is proved a different state given the same batches*


```solidity
event ProveNonDeterministicPendingState(bytes32 storedStateRoot, bytes32 provedStateRoot);
```

### OverridePendingState
*Emitted when the trusted aggregator overrides pending state*


```solidity
event OverridePendingState(
    uint32 indexed rollupID, uint64 numBatch, bytes32 stateRoot, bytes32 exitRoot, address aggregator
);
```

### RollbackBatches
*Emitted when rollback batches*


```solidity
event RollbackBatches(uint32 indexed rollupID, uint64 indexed targetBatch, bytes32 accInputHashToRollback);
```

### SetTrustedAggregatorTimeout
*Emitted when is updated the trusted aggregator timeout*


```solidity
event SetTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout);
```

### SetPendingStateTimeout
*Emitted when is updated the pending state timeout*


```solidity
event SetPendingStateTimeout(uint64 newPendingStateTimeout);
```

### SetMultiplierBatchFee
*Emitted when is updated the multiplier batch fee*


```solidity
event SetMultiplierBatchFee(uint16 newMultiplierBatchFee);
```

### SetVerifyBatchTimeTarget
*Emitted when is updated the verify batch timeout*


```solidity
event SetVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget);
```

### SetTrustedAggregator
*Emitted when is updated the trusted aggregator address*


```solidity
event SetTrustedAggregator(address newTrustedAggregator);
```

### SetBatchFee
*Emitted when is updated the batch fee*


```solidity
event SetBatchFee(uint256 newBatchFee);
```

## Structs
### RollupType
Struct which to store the rollup type data


```solidity
struct RollupType {
    address consensusImplementation;
    IVerifierRollup verifier;
    uint64 forkID;
    uint8 rollupCompatibilityID;
    bool obsolete;
    bytes32 genesis;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`consensusImplementation`|`address`|Consensus implementation ( contains the consensus logic for the transaparent proxy)|
|`verifier`|`IVerifierRollup`|verifier|
|`forkID`|`uint64`|fork ID|
|`rollupCompatibilityID`|`uint8`|Rollup compatibility ID, to check upgradability between rollup types|
|`obsolete`|`bool`|Indicates if the rollup type is obsolete|
|`genesis`|`bytes32`|Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them|

### RollupData
Struct which to store the rollup data of each chain


```solidity
struct RollupData {
    IPolygonRollupBase rollupContract;
    uint64 chainID;
    IVerifierRollup verifier;
    uint64 forkID;
    mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
    mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
    mapping(uint256 pendingStateNum => PendingState) pendingStateTransitions;
    bytes32 lastLocalExitRoot;
    uint64 lastBatchSequenced;
    uint64 lastVerifiedBatch;
    uint64 lastPendingState;
    uint64 lastPendingStateConsolidated;
    uint64 lastVerifiedBatchBeforeUpgrade;
    uint64 rollupTypeID;
    uint8 rollupCompatibilityID;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`IPolygonRollupBase`|Rollup consensus contract, which manages everything related to sequencing transactions|
|`chainID`|`uint64`|Chain ID of the rollup|
|`verifier`|`IVerifierRollup`|Verifier contract|
|`forkID`|`uint64`|ForkID of the rollup|
|`batchNumToStateRoot`|`mapping(uint64 batchNum => bytes32)`|State root mapping|
|`sequencedBatches`|`mapping(uint64 batchNum => SequencedBatchData)`|Queue of batches that defines the virtual state|
|`pendingStateTransitions`|`mapping(uint256 pendingStateNum => PendingState)`|Pending state mapping|
|`lastLocalExitRoot`|`bytes32`|Last exit root verified, used for compute the rollupExitRoot|
|`lastBatchSequenced`|`uint64`|Last batch sent by the consensus contract|
|`lastVerifiedBatch`|`uint64`|Last batch verified|
|`lastPendingState`|`uint64`|Last pending state|
|`lastPendingStateConsolidated`|`uint64`|Last pending state consolidated|
|`lastVerifiedBatchBeforeUpgrade`|`uint64`|Last batch verified before the last upgrade|
|`rollupTypeID`|`uint64`|Rollup type ID, can be 0 if it was added as an existing rollup|
|`rollupCompatibilityID`|`uint8`|Rollup ID used for compatibility checks when upgrading|

