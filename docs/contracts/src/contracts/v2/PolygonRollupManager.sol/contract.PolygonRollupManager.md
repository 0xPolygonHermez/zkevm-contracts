# PolygonRollupManager
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/PolygonRollupManager.sol)

**Inherits:**
[PolygonAccessControlUpgradeable](/contracts/v2/lib/PolygonAccessControlUpgradeable.sol/abstract.PolygonAccessControlUpgradeable.md), [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [LegacyZKEVMStateVariables](/contracts/v2/lib/LegacyZKEVMStateVariables.sol/contract.LegacyZKEVMStateVariables.md), [PolygonConstantsBase](/contracts/v2/lib/PolygonConstantsBase.sol/contract.PolygonConstantsBase.md), [IPolygonRollupManager](/contracts/v2/interfaces/IPolygonRollupManager.sol/interface.IPolygonRollupManager.md), ReentrancyGuardTransient

Contract responsible for managing rollups and the verification of their batches.
This contract will create and update rollups and store all the hashed sequenced data from them.
The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.


## State Variables
### _RFIELD

```solidity
uint256 internal constant _RFIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
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


### ROLLUP_MANAGER_VERSION

```solidity
string public constant ROLLUP_MANAGER_VERSION = "al-v0.3.0";
```


### _NO_ADDRESS

```solidity
address private constant _NO_ADDRESS = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;
```


### globalExitRootManager
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;
```


### bridgeAddress
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IPolygonZkEVMBridge public immutable bridgeAddress;
```


### pol
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IERC20Upgradeable public immutable pol;
```


### aggLayerGateway
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IAggLayerGateway public immutable aggLayerGateway;
```


### rollupTypeCount

```solidity
uint32 public rollupTypeCount;
```


### rollupTypeMap
**Note:**
oz-retyped-from: PolygonRollupManagerPrevious.RollupType


```solidity
mapping(uint32 rollupTypeID => RollupType) public rollupTypeMap;
```


### rollupCount

```solidity
uint32 public rollupCount;
```


### _rollupIDToRollupData
**Note:**
oz-retyped-from: PolygonRollupManagerPrevious.RollupData


```solidity
mapping(uint32 rollupID => RollupData) internal _rollupIDToRollupData;
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


### __legacyTrustedAggregatorTimeout
**Note:**
oz-renamed-from: trustedAggregatorTimeout


```solidity
uint64 internal __legacyTrustedAggregatorTimeout;
```


### __legacyPendingStateTimeout
**Note:**
oz-renamed-from: pendingStateTimeout


```solidity
uint64 internal __legacyPendingStateTimeout;
```


### __legacyVerifyBatchTimeTarget
**Note:**
oz-renamed-from: verifyBatchTimeTarget


```solidity
uint64 internal __legacyVerifyBatchTimeTarget;
```


### __legacyMultiplierBatchFee
**Note:**
oz-renamed-from: multiplierBatchFee


```solidity
uint16 internal __legacyMultiplierBatchFee;
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
    IPolygonZkEVMBridge _bridgeAddress,
    IAggLayerGateway _aggLayerGateway
);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|
|`_aggLayerGateway`|`IAggLayerGateway`|Polygon Verifier Gateway address|


### initialize

Initializer function to set new rollup manager version


```solidity
function initialize() external virtual reinitializer(4);
```

### addNewRollupType

Add a new rollup type


```solidity
function addNewRollupType(
    address consensusImplementation,
    address verifier,
    uint64 forkID,
    VerifierType rollupVerifierType,
    bytes32 genesis,
    string memory description,
    bytes32 programVKey
) external onlyRole(_ADD_ROLLUP_TYPE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`consensusImplementation`|`address`|Consensus implementation|
|`verifier`|`address`|Verifier address|
|`forkID`|`uint64`|ForkID of the verifier|
|`rollupVerifierType`|`VerifierType`|rollup verifier type|
|`genesis`|`bytes32`|Genesis block of the rollup|
|`description`|`string`|Description of the rollup type|
|`programVKey`|`bytes32`|Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1|


### obsoleteRollupType

Obsolete Rollup type


```solidity
function obsoleteRollupType(uint32 rollupTypeID) external onlyRole(_OBSOLETE_ROLLUP_TYPE_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupTypeID`|`uint32`|Rollup type to obsolete|


### attachAggchainToAL

Create a new rollup

*in case of rollupType state transition or pessimistic, the encoded params
are the following: (address admin, address sequencer, address gasTokenAddress, string sequencerURL, string networkName)*


```solidity
function attachAggchainToAL(uint32 rollupTypeID, uint64 chainID, bytes memory initializeBytesAggchain)
    external
    onlyRole(_CREATE_ROLLUP_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupTypeID`|`uint32`|Rollup type to deploy|
|`chainID`|`uint64`|ChainID of the rollup, must be a new one, can not have more than 32 bits|
|`initializeBytesAggchain`|`bytes`|Encoded params to initialize the chain. Each aggchain has its encoded params.|


### addExistingRollup

Add an already deployed rollup
note that this rollup does not follow any rollupType


```solidity
function addExistingRollup(
    address rollupAddress,
    address verifier,
    uint64 forkID,
    uint64 chainID,
    bytes32 initRoot,
    VerifierType rollupVerifierType,
    bytes32 programVKey,
    bytes32 initPessimisticRoot
) external onlyRole(_ADD_EXISTING_ROLLUP_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupAddress`|`address`|Rollup address|
|`verifier`|`address`|Verifier address, must be added before|
|`forkID`|`uint64`|Fork id of the added rollup|
|`chainID`|`uint64`|Chain id of the added rollup|
|`initRoot`|`bytes32`|Genesis block for StateTransitionChains & localExitRoot for pessimistic chain|
|`rollupVerifierType`|`VerifierType`|Compatibility ID for the added rollup|
|`programVKey`|`bytes32`|Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1|
|`initPessimisticRoot`|`bytes32`|Pessimistic root to init the chain.|


### updateRollupByRollupAdmin

Upgrade an existing rollup from the rollup admin address
This address is able to update the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE


```solidity
function updateRollupByRollupAdmin(ITransparentUpgradeableProxy rollupContract, uint32 newRollupTypeID) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`ITransparentUpgradeableProxy`|Rollup consensus proxy address|
|`newRollupTypeID`|`uint32`|New rollupTypeID to upgrade to|


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
|`newRollupTypeID`|`uint32`|New rollupTypeID to upgrade to|
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
|`newRollupTypeID`|`uint32`|New rollupTypeID to upgrade to|
|`upgradeData`|`bytes`|Upgrade data|


### rollbackBatches

Rollback batches of the target rollup
Only applies to state transition rollups


```solidity
function rollbackBatches(IPolygonRollupBase rollupContract, uint64 targetBatch) external nonReentrant;
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
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used (deprecated)|
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
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`beneficiary`|`address`|Address that will receive the verification reward|
|`proof`|`bytes32[24]`|Fflonk proof|


### verifyPessimisticTrustedAggregator

Allows a trusted aggregator to verify pessimistic proof

*A reentrancy measure has been applied because this function calls `onVerifyPessimistic`, is an open function implemented by the aggchains*

*the function can not be a view because the nonReentrant uses a transient storage variable*


```solidity
function verifyPessimisticTrustedAggregator(
    uint32 rollupID,
    uint32 l1InfoTreeLeafCount,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes calldata proof,
    bytes calldata aggchainData
) external onlyRole(_TRUSTED_AGGREGATOR_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`l1InfoTreeLeafCount`|`uint32`|Count of the L1InfoTree leaf that will be used to verify imported bridge exits|
|`newLocalExitRoot`|`bytes32`|New local exit root|
|`newPessimisticRoot`|`bytes32`|New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)|
|`proof`|`bytes`|SP1 proof (Plonk)|
|`aggchainData`|`bytes`|Specific custom data to verify Aggregation layer chains|


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

### calculateRewardPerBatch

Function to calculate the reward to verify a single batch


```solidity
function calculateRewardPerBatch() public view returns (uint256);
```

### getBatchFee

Get batch fee
This function is used instead of the automatic public view one,
because in a future might change the behavior and we will be able to maintain the interface


```solidity
function getBatchFee() public view returns (uint256);
```

### getForcedBatchFee

Get forced batch fee


```solidity
function getForcedBatchFee() public view returns (uint256);
```

### getInputPessimisticBytes

Function to calculate the pessimistic input bytes


```solidity
function getInputPessimisticBytes(
    uint32 rollupID,
    bytes32 l1InfoTreeRoot,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes calldata aggchainData
) external view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup id used to calculate the input snark bytes|
|`l1InfoTreeRoot`|`bytes32`|L1 Info tree root to proof imported bridges|
|`newLocalExitRoot`|`bytes32`|New local exit root|
|`newPessimisticRoot`|`bytes32`|New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)|
|`aggchainData`|`bytes`|Specific custom data to verify Aggregation layer chains|


### _getInputPessimisticBytes

Function to calculate the input snark bytes


```solidity
function _getInputPessimisticBytes(
    uint32 rollupID,
    RollupData storage rollup,
    bytes32 l1InfoTreeRoot,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes calldata aggchainData
) internal view returns (bytes memory inputPessimisticBytes);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|
|`rollup`|`RollupData`|Rollup data storage pointer|
|`l1InfoTreeRoot`|`bytes32`|L1 Info tree root to proof imported bridges|
|`newLocalExitRoot`|`bytes32`|New local exit root|
|`newPessimisticRoot`|`bytes32`|New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)|
|`aggchainData`|`bytes`||


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


### rollupIDToRollupData

Get rollup data: VerifierType StateTransition


```solidity
function rollupIDToRollupData(uint32 rollupID) public view returns (RollupDataReturn memory rollupData);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|


### rollupIDToRollupDataDeserialized

Get rollup data: VerifierType State transition


```solidity
function rollupIDToRollupDataDeserialized(uint32 rollupID)
    public
    view
    returns (
        address rollupContract,
        uint64 chainID,
        address verifier,
        uint64 forkID,
        bytes32 lastLocalExitRoot,
        uint64 lastBatchSequenced,
        uint64 lastVerifiedBatch,
        uint64 _legacyLastPendingState,
        uint64 _legacyLastPendingStateConsolidated,
        uint64 lastVerifiedBatchBeforeUpgrade,
        uint64 rollupTypeID,
        VerifierType rollupVerifierType
    );
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|


### rollupIDToRollupDataV2

Get rollup data: VerifierType Pessimistic


```solidity
function rollupIDToRollupDataV2(uint32 rollupID) public view returns (RollupDataReturnV2 memory rollupData);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|


### rollupIDToRollupDataV2Deserialized

Get rollup data deserialized

*A deserialized version of the rollup data done for a better parsing from etherscan*


```solidity
function rollupIDToRollupDataV2Deserialized(uint32 rollupID)
    public
    view
    returns (
        address rollupContract,
        uint64 chainID,
        address verifier,
        uint64 forkID,
        bytes32 lastLocalExitRoot,
        uint64 lastBatchSequenced,
        uint64 lastVerifiedBatch,
        uint64 lastVerifiedBatchBeforeUpgrade,
        uint64 rollupTypeID,
        VerifierType rollupVerifierType,
        bytes32 lastPessimisticRoot,
        bytes32 programVKey
    );
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup identifier|


## Events
### AddNewRollupType
*Emitted when a new rollup type is added*


```solidity
event AddNewRollupType(
    uint32 indexed rollupTypeID,
    address consensusImplementation,
    address verifier,
    uint64 forkID,
    VerifierType rollupVerifierType,
    bytes32 genesis,
    string description,
    bytes32 programVKey
);
```

### ObsoleteRollupType
*Emitted when a a rollup type is obsoleted*


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
    VerifierType rollupVerifierType,
    uint64 lastVerifiedBatchBeforeUpgrade,
    bytes32 programVKey,
    bytes32 initPessimisticRoot
);
```

### UpdateRollup
*Emitted when a rollup is updated*


```solidity
event UpdateRollup(uint32 indexed rollupID, uint32 newRollupTypeID, uint64 lastVerifiedBatchBeforeUpgrade);
```

### OnSequenceBatches
*Emitted when a new verifier is added*


```solidity
event OnSequenceBatches(uint32 indexed rollupID, uint64 lastBatchSequenced);
```

### VerifyBatchesTrustedAggregator
*Emitted when the trusted aggregator verifies batches*


```solidity
event VerifyBatchesTrustedAggregator(
    uint32 indexed rollupID, uint64 numBatch, bytes32 stateRoot, bytes32 exitRoot, address indexed aggregator
);
```

### RollbackBatches
*Emitted when rollback batches*


```solidity
event RollbackBatches(uint32 indexed rollupID, uint64 indexed targetBatch, bytes32 accInputHashToRollback);
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

### UpdateRollupManagerVersion
*Emitted when rollup manager is upgraded*


```solidity
event UpdateRollupManagerVersion(string rollupManagerVersion);
```

### VerifyPessimisticStateTransition
Emitted when a ALGateway or Pessimistic chain verifies a pessimistic proof


```solidity
event VerifyPessimisticStateTransition(
    uint32 indexed rollupID,
    bytes32 prevPessimisticRoot,
    bytes32 newPessimisticRoot,
    bytes32 prevLocalExitRoot,
    bytes32 newLocalExitRoot,
    bytes32 l1InfoRoot,
    address indexed trustedAggregator
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rollupID`|`uint32`|Rollup ID|
|`prevPessimisticRoot`|`bytes32`|Previous pessimistic root|
|`newPessimisticRoot`|`bytes32`|New pessimistic root|
|`prevLocalExitRoot`|`bytes32`|Previous local exit root|
|`newLocalExitRoot`|`bytes32`|New local exit root|
|`l1InfoRoot`|`bytes32`|L1 info root|
|`trustedAggregator`|`address`|Trusted aggregator address|

### CreateNewAggchain
*Emitted when a new rollup is created based on a rollupType*


```solidity
event CreateNewAggchain(
    uint32 indexed rollupID,
    uint32 rollupTypeID,
    address rollupAddress,
    uint64 chainID,
    uint8 rollupVerifierType,
    bytes initializeBytesAggchain
);
```

## Structs
### RollupType
Struct which to store the rollup type data


```solidity
struct RollupType {
    address consensusImplementation;
    address verifier;
    uint64 forkID;
    VerifierType rollupVerifierType;
    bool obsolete;
    bytes32 genesis;
    bytes32 programVKey;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`consensusImplementation`|`address`|Consensus implementation ( contains the consensus logic for the transparent proxy)|
|`verifier`|`address`||
|`forkID`|`uint64`|fork ID|
|`rollupVerifierType`|`VerifierType`|Rollup compatibility ID, to check upgradability between rollup types|
|`obsolete`|`bool`|Indicates if the rollup type is obsolete|
|`genesis`|`bytes32`|Genesis block of the rollup, note that will only be used on creating new rollups, not upgrade them|
|`programVKey`|`bytes32`|Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1|

### RollupData
Struct which to store the rollup data of each chain


```solidity
struct RollupData {
    address rollupContract;
    uint64 chainID;
    address verifier;
    uint64 forkID;
    mapping(uint64 batchNum => bytes32) batchNumToStateRoot;
    mapping(uint64 batchNum => SequencedBatchData) sequencedBatches;
    mapping(uint256 pendingStateNum => PendingState) _legacyPendingStateTransitions;
    bytes32 lastLocalExitRoot;
    uint64 lastBatchSequenced;
    uint64 lastVerifiedBatch;
    uint64 _legacyLastPendingState;
    uint64 _legacyLastPendingStateConsolidated;
    uint64 lastVerifiedBatchBeforeUpgrade;
    uint64 rollupTypeID;
    VerifierType rollupVerifierType;
    bytes32 lastPessimisticRoot;
    bytes32 programVKey;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`address`|Rollup consensus contract, which manages everything related to sequencing transactions|
|`chainID`|`uint64`|Chain ID of the rollup|
|`verifier`|`address`|Verifier contract|
|`forkID`|`uint64`|ForkID of the rollup|
|`batchNumToStateRoot`|`mapping(uint64 batchNum => bytes32)`|State root mapping|
|`sequencedBatches`|`mapping(uint64 batchNum => SequencedBatchData)`|Queue of batches that defines the virtual state|
|`_legacyPendingStateTransitions`|`mapping(uint256 pendingStateNum => PendingState)`|Pending state mapping (deprecated)|
|`lastLocalExitRoot`|`bytes32`|Last exit root verified, used for compute the rollupExitRoot|
|`lastBatchSequenced`|`uint64`|Last batch sent by the consensus contract|
|`lastVerifiedBatch`|`uint64`|Last batch verified|
|`_legacyLastPendingState`|`uint64`|Last pending state (deprecated)|
|`_legacyLastPendingStateConsolidated`|`uint64`|Last pending state consolidated (deprecated)|
|`lastVerifiedBatchBeforeUpgrade`|`uint64`|Last batch verified before the last upgrade|
|`rollupTypeID`|`uint64`|Rollup type ID, can be 0 if it was added as an existing rollup|
|`rollupVerifierType`|`VerifierType`|Rollup ID used for compatibility checks when upgrading|
|`lastPessimisticRoot`|`bytes32`|Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed|
|`programVKey`|`bytes32`|Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1|

### RollupDataReturn
Struct to return all the necessary rollup info: VerifierType StateTransition


```solidity
struct RollupDataReturn {
    address rollupContract;
    uint64 chainID;
    address verifier;
    uint64 forkID;
    bytes32 lastLocalExitRoot;
    uint64 lastBatchSequenced;
    uint64 lastVerifiedBatch;
    uint64 _legacyLastPendingState;
    uint64 _legacyLastPendingStateConsolidated;
    uint64 lastVerifiedBatchBeforeUpgrade;
    uint64 rollupTypeID;
    VerifierType rollupVerifierType;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`address`|Rollup consensus contract, which manages everything related to sequencing transactions|
|`chainID`|`uint64`|Chain ID of the rollup|
|`verifier`|`address`|Verifier contract|
|`forkID`|`uint64`|ForkID of the rollup|
|`lastLocalExitRoot`|`bytes32`|Last exit root verified, used for compute the rollupExitRoot|
|`lastBatchSequenced`|`uint64`|Last batch sent by the consensus contract|
|`lastVerifiedBatch`|`uint64`|Last batch verified|
|`_legacyLastPendingState`|`uint64`|Last pending state (deprecated)|
|`_legacyLastPendingStateConsolidated`|`uint64`|Last pending state consolidated (deprecated)|
|`lastVerifiedBatchBeforeUpgrade`|`uint64`|Last batch verified before the last upgrade|
|`rollupTypeID`|`uint64`|Rollup type ID, can be 0 if it was added as an existing rollup|
|`rollupVerifierType`|`VerifierType`|Rollup ID used for compatibility checks when upgrading|

### RollupDataReturnV2
Struct which to store the rollup data of each chain


```solidity
struct RollupDataReturnV2 {
    address rollupContract;
    uint64 chainID;
    address verifier;
    uint64 forkID;
    bytes32 lastLocalExitRoot;
    uint64 lastBatchSequenced;
    uint64 lastVerifiedBatch;
    uint64 lastVerifiedBatchBeforeUpgrade;
    uint64 rollupTypeID;
    VerifierType rollupVerifierType;
    bytes32 lastPessimisticRoot;
    bytes32 programVKey;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`rollupContract`|`address`|Rollup consensus contract, which manages everything related to sequencing transactions|
|`chainID`|`uint64`|Chain ID of the rollup|
|`verifier`|`address`|Verifier contract|
|`forkID`|`uint64`|ForkID of the rollup|
|`lastLocalExitRoot`|`bytes32`|Last exit root verified, used for compute the rollupExitRoot|
|`lastBatchSequenced`|`uint64`|Last batch sent by the consensus contract|
|`lastVerifiedBatch`|`uint64`|Last batch verified|
|`lastVerifiedBatchBeforeUpgrade`|`uint64`|Last batch verified before the last upgrade|
|`rollupTypeID`|`uint64`|Rollup type ID, can be 0 if it was added as an existing rollup|
|`rollupVerifierType`|`VerifierType`|Rollup ID used for compatibility checks when upgrading|
|`lastPessimisticRoot`|`bytes32`|Pessimistic info, currently contains the local balance tree and the local nullifier tree hashed|
|`programVKey`|`bytes32`|Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1|

