# PolygonZkEVM
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/PolygonZkEVM.sol)

**Inherits:**
OwnableUpgradeable, [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [IPolygonZkEVMErrors](/contracts/interfaces/IPolygonZkEVMErrors.sol/interface.IPolygonZkEVMErrors.md)

Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## State Variables
### _RFIELD

```solidity
uint256 internal constant _RFIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
```


### _MAX_TRANSACTIONS_BYTE_LENGTH

```solidity
uint256 internal constant _MAX_TRANSACTIONS_BYTE_LENGTH = 120000;
```


### _MAX_FORCE_BATCH_BYTE_LENGTH

```solidity
uint256 internal constant _MAX_FORCE_BATCH_BYTE_LENGTH = 5000;
```


### _HALT_AGGREGATION_TIMEOUT

```solidity
uint64 internal constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;
```


### _MAX_VERIFY_BATCHES

```solidity
uint64 internal constant _MAX_VERIFY_BATCHES = 1000;
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


### matic

```solidity
IERC20Upgradeable public immutable matic;
```


### rollupVerifier

```solidity
IVerifierRollup public immutable rollupVerifier;
```


### globalExitRootManager

```solidity
IPolygonZkEVMGlobalExitRoot public immutable globalExitRootManager;
```


### bridgeAddress

```solidity
IPolygonZkEVMBridge public immutable bridgeAddress;
```


### chainID

```solidity
uint64 public immutable chainID;
```


### forkID

```solidity
uint64 public immutable forkID;
```


### verifyBatchTimeTarget

```solidity
uint64 public verifyBatchTimeTarget;
```


### multiplierBatchFee

```solidity
uint16 public multiplierBatchFee;
```


### trustedSequencer

```solidity
address public trustedSequencer;
```


### batchFee

```solidity
uint256 public batchFee;
```


### forcedBatches

```solidity
mapping(uint64 => bytes32) public forcedBatches;
```


### sequencedBatches

```solidity
mapping(uint64 => SequencedBatchData) public sequencedBatches;
```


### lastTimestamp

```solidity
uint64 public lastTimestamp;
```


### lastBatchSequenced

```solidity
uint64 public lastBatchSequenced;
```


### lastForceBatchSequenced

```solidity
uint64 public lastForceBatchSequenced;
```


### lastForceBatch

```solidity
uint64 public lastForceBatch;
```


### lastVerifiedBatch

```solidity
uint64 public lastVerifiedBatch;
```


### trustedAggregator

```solidity
address public trustedAggregator;
```


### batchNumToStateRoot

```solidity
mapping(uint64 => bytes32) public batchNumToStateRoot;
```


### trustedSequencerURL

```solidity
string public trustedSequencerURL;
```


### networkName

```solidity
string public networkName;
```


### pendingStateTransitions

```solidity
mapping(uint256 => PendingState) public pendingStateTransitions;
```


### lastPendingState

```solidity
uint64 public lastPendingState;
```


### lastPendingStateConsolidated

```solidity
uint64 public lastPendingStateConsolidated;
```


### pendingStateTimeout

```solidity
uint64 public pendingStateTimeout;
```


### trustedAggregatorTimeout

```solidity
uint64 public trustedAggregatorTimeout;
```


### admin

```solidity
address public admin;
```


### pendingAdmin

```solidity
address public pendingAdmin;
```


### forceBatchTimeout

```solidity
uint64 public forceBatchTimeout;
```


### isForcedBatchDisallowed

```solidity
bool public isForcedBatchDisallowed;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    IERC20Upgradeable _matic,
    IVerifierRollup _rollupVerifier,
    IPolygonZkEVMBridge _bridgeAddress,
    uint64 _chainID,
    uint64 _forkID
);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRoot`|Global exit root manager address|
|`_matic`|`IERC20Upgradeable`|MATIC token address|
|`_rollupVerifier`|`IVerifierRollup`|Rollup verifier address|
|`_bridgeAddress`|`IPolygonZkEVMBridge`|Bridge address|
|`_chainID`|`uint64`|L2 chainID|
|`_forkID`|`uint64`|Fork Id|


### initialize


```solidity
function initialize(
    InitializePackedParameters calldata initializePackedParameters,
    bytes32 genesisRoot,
    string memory _trustedSequencerURL,
    string memory _networkName,
    string calldata _version
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`initializePackedParameters`|`InitializePackedParameters`|Struct to save gas and avoid stack too deep errors|
|`genesisRoot`|`bytes32`|Rollup genesis root|
|`_trustedSequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|
|`_version`|`string`||


### onlyAdmin


```solidity
modifier onlyAdmin();
```

### onlyTrustedSequencer


```solidity
modifier onlyTrustedSequencer();
```

### onlyTrustedAggregator


```solidity
modifier onlyTrustedAggregator();
```

### isForceBatchAllowed


```solidity
modifier isForceBatchAllowed();
```

### sequenceBatches

Allows a sequencer to send multiple batches


```solidity
function sequenceBatches(BatchData[] calldata batches, address l2Coinbase)
    external
    ifNotEmergencyState
    onlyTrustedSequencer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`BatchData[]`|Struct array which holds the necessary data to append new batches to the sequence|
|`l2Coinbase`|`address`|Address that will receive the fees from L2|


### verifyBatches

Allows an aggregator to verify multiple batches


```solidity
function verifyBatches(
    uint64 pendingStateNum,
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
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### verifyBatchesTrustedAggregator

Allows an aggregator to verify multiple batches


```solidity
function verifyBatchesTrustedAggregator(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) external onlyTrustedAggregator;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### _verifyAndRewardBatches

Verify and reward batches internal function


```solidity
function _verifyAndRewardBatches(
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) internal virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### _tryConsolidatePendingState

Internal function to consolidate the state automatically once sequence or verify batches are called
It tries to consolidate the first and the middle pending state in the queue


```solidity
function _tryConsolidatePendingState() internal;
```

### consolidatePendingState

Allows to consolidate any pending state that has already exceed the pendingStateTimeout
Can be called by the trusted aggregator, which can consolidate any state without the timeout restrictions


```solidity
function consolidatePendingState(uint64 pendingStateNum) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Pending state to consolidate|


### _consolidatePendingState

Internal function to consolidate any pending state that has already exceed the pendingStateTimeout


```solidity
function _consolidatePendingState(uint64 pendingStateNum) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pendingStateNum`|`uint64`|Pending state to consolidate|


### _updateBatchFee

Function to update the batch fee based on the new verified batches
The batch fee will not be updated when the trusted aggregator verifies batches


```solidity
function _updateBatchFee(uint64 newLastVerifiedBatch) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLastVerifiedBatch`|`uint64`|New last verified batch|


### forceBatch

Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected
Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
In order to assure that users force transactions will be processed properly, user must not sign any other transaction
with the same nonce


```solidity
function forceBatch(bytes calldata transactions, uint256 maticAmount) public isForceBatchAllowed ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`transactions`|`bytes`|L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:|
|`maticAmount`|`uint256`|Max amount of MATIC tokens that the sender is willing to pay|


### sequenceForceBatches

Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


```solidity
function sequenceForceBatches(ForcedBatchData[] calldata batches) external isForceBatchAllowed ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`ForcedBatchData[]`|Struct array which holds the necessary data to append force batches|


### setTrustedSequencer

Allow the admin to set a new trusted sequencer


```solidity
function setTrustedSequencer(address newTrustedSequencer) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedSequencer`|`address`|Address of the new trusted sequencer|


### setTrustedSequencerURL

Allow the admin to set the trusted sequencer URL


```solidity
function setTrustedSequencerURL(string memory newTrustedSequencerURL) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedSequencerURL`|`string`|URL of trusted sequencer|


### setTrustedAggregator

Allow the admin to set a new trusted aggregator address


```solidity
function setTrustedAggregator(address newTrustedAggregator) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedAggregator`|`address`|Address of the new trusted aggregator|


### setTrustedAggregatorTimeout

Allow the admin to set a new pending state timeout
The timeout can only be lowered, except if emergency state is active


```solidity
function setTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedAggregatorTimeout`|`uint64`|Trusted aggregator timeout|


### setPendingStateTimeout

Allow the admin to set a new trusted aggregator timeout
The timeout can only be lowered, except if emergency state is active


```solidity
function setPendingStateTimeout(uint64 newPendingStateTimeout) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newPendingStateTimeout`|`uint64`|Trusted aggregator timeout|


### setMultiplierBatchFee

Allow the admin to set a new multiplier batch fee


```solidity
function setMultiplierBatchFee(uint16 newMultiplierBatchFee) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMultiplierBatchFee`|`uint16`|multiplier batch fee|


### setVerifyBatchTimeTarget

Allow the admin to set a new verify batch time target
This value will only be relevant once the aggregation is decentralized, so
the trustedAggregatorTimeout should be zero or very close to zero


```solidity
function setVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newVerifyBatchTimeTarget`|`uint64`|Verify batch time target|


### setForceBatchTimeout

Allow the admin to set the forcedBatchTimeout
The new value can only be lower, except if emergency state is active


```solidity
function setForceBatchTimeout(uint64 newforceBatchTimeout) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newforceBatchTimeout`|`uint64`|New force batch timeout|


### activateForceBatches

Allow the admin to turn on the force batches
This action is not reversible


```solidity
function activateForceBatches() external onlyAdmin;
```

### transferAdminRole

Starts the admin role transfer
This is a two step process, the pending admin must accepted to finalize the process


```solidity
function transferAdminRole(address newPendingAdmin) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newPendingAdmin`|`address`|Address of the new pending admin|


### acceptAdminRole

Allow the current pending admin to accept the admin role


```solidity
function acceptAdminRole() external;
```

### overridePendingState

Allows the trusted aggregator to override the pending state
if it's possible to prove a different state root given the same batches


```solidity
function overridePendingState(
    uint64 initPendingStateNum,
    uint64 finalPendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    bytes32[24] calldata proof
) external onlyTrustedAggregator;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### proveNonDeterministicPendingState

Allows to halt the PolygonZkEVM if its possible to prove a different state root given the same batches


```solidity
function proveNonDeterministicPendingState(
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
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### _proveDistinctPendingState

Internal function that proves a different state root given the same batches to verify


```solidity
function _proveDistinctPendingState(
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
|`initPendingStateNum`|`uint64`|Init pending state, 0 if consolidated state is used|
|`finalPendingStateNum`|`uint64`|Final pending state, that will be used to compare with the newStateRoot|
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`| New local exit root once the batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|
|`proof`|`bytes32[24]`|fflonk proof|


### activateEmergencyState

Function to activate emergency state, which also enables the emergency mode on both PolygonZkEVM and PolygonZkEVMBridge contracts
If not called by the owner must be provided a batcnNum that does not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period


```solidity
function activateEmergencyState(uint64 sequencedBatchNum) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sequencedBatchNum`|`uint64`|Sequenced batch number that has not been aggreagated in _HALT_AGGREGATION_TIMEOUT|


### deactivateEmergencyState

Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts


```solidity
function deactivateEmergencyState() external onlyAdmin;
```

### _activateEmergencyState

Internal function to activate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts


```solidity
function _activateEmergencyState() internal override;
```

### getForcedBatchFee

Get forced batch fee


```solidity
function getForcedBatchFee() public view returns (uint256);
```

### getLastVerifiedBatch

Get the last verified batch


```solidity
function getLastVerifiedBatch() public view returns (uint64);
```

### isPendingStateConsolidable

Returns a boolean that indicates if the pendingStateNum is or not consolidable
Note that his function does not check if the pending state currently exists, or if it's consolidated already


```solidity
function isPendingStateConsolidable(uint64 pendingStateNum) public view returns (bool);
```

### calculateRewardPerBatch

Function to calculate the reward to verify a single batch


```solidity
function calculateRewardPerBatch() public view returns (uint256);
```

### getInputSnarkBytes

Function to calculate the input snark bytes


```solidity
function getInputSnarkBytes(
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
|`initNumBatch`|`uint64`|Batch which the aggregator starts the verification|
|`finalNewBatch`|`uint64`|Last batch aggregator intends to verify|
|`newLocalExitRoot`|`bytes32`|New local exit root once the batch is processed|
|`oldStateRoot`|`bytes32`|State root before batch is processed|
|`newStateRoot`|`bytes32`|New State root once the batch is processed|


### checkStateRootInsidePrime


```solidity
function checkStateRootInsidePrime(uint256 newStateRoot) public pure returns (bool);
```

## Events
### SequenceBatches
*Emitted when the trusted sequencer sends a new batch of transactions*


```solidity
event SequenceBatches(uint64 indexed numBatch);
```

### ForceBatch
*Emitted when a batch is forced*


```solidity
event ForceBatch(uint64 indexed forceBatchNum, bytes32 lastGlobalExitRoot, address sequencer, bytes transactions);
```

### SequenceForceBatches
*Emitted when forced batches are sequenced by not the trusted sequencer*


```solidity
event SequenceForceBatches(uint64 indexed numBatch);
```

### VerifyBatches
*Emitted when a aggregator verifies batches*


```solidity
event VerifyBatches(uint64 indexed numBatch, bytes32 stateRoot, address indexed aggregator);
```

### VerifyBatchesTrustedAggregator
*Emitted when the trusted aggregator verifies batches*


```solidity
event VerifyBatchesTrustedAggregator(uint64 indexed numBatch, bytes32 stateRoot, address indexed aggregator);
```

### ConsolidatePendingState
*Emitted when pending state is consolidated*


```solidity
event ConsolidatePendingState(uint64 indexed numBatch, bytes32 stateRoot, uint64 indexed pendingStateNum);
```

### SetTrustedSequencer
*Emitted when the admin updates the trusted sequencer address*


```solidity
event SetTrustedSequencer(address newTrustedSequencer);
```

### SetTrustedSequencerURL
*Emitted when the admin updates the sequencer URL*


```solidity
event SetTrustedSequencerURL(string newTrustedSequencerURL);
```

### SetTrustedAggregatorTimeout
*Emitted when the admin updates the trusted aggregator timeout*


```solidity
event SetTrustedAggregatorTimeout(uint64 newTrustedAggregatorTimeout);
```

### SetPendingStateTimeout
*Emitted when the admin updates the pending state timeout*


```solidity
event SetPendingStateTimeout(uint64 newPendingStateTimeout);
```

### SetTrustedAggregator
*Emitted when the admin updates the trusted aggregator address*


```solidity
event SetTrustedAggregator(address newTrustedAggregator);
```

### SetMultiplierBatchFee
*Emitted when the admin updates the multiplier batch fee*


```solidity
event SetMultiplierBatchFee(uint16 newMultiplierBatchFee);
```

### SetVerifyBatchTimeTarget
*Emitted when the admin updates the verify batch timeout*


```solidity
event SetVerifyBatchTimeTarget(uint64 newVerifyBatchTimeTarget);
```

### SetForceBatchTimeout
*Emitted when the admin update the force batch timeout*


```solidity
event SetForceBatchTimeout(uint64 newforceBatchTimeout);
```

### ActivateForceBatches
*Emitted when activate force batches*


```solidity
event ActivateForceBatches();
```

### TransferAdminRole
*Emitted when the admin starts the two-step transfer role setting a new pending admin*


```solidity
event TransferAdminRole(address newPendingAdmin);
```

### AcceptAdminRole
*Emitted when the pending admin accepts the admin role*


```solidity
event AcceptAdminRole(address newAdmin);
```

### ProveNonDeterministicPendingState
*Emitted when is proved a different state given the same batches*


```solidity
event ProveNonDeterministicPendingState(bytes32 storedStateRoot, bytes32 provedStateRoot);
```

### OverridePendingState
*Emitted when the trusted aggregator overrides pending state*


```solidity
event OverridePendingState(uint64 indexed numBatch, bytes32 stateRoot, address indexed aggregator);
```

### UpdateZkEVMVersion
*Emitted everytime the forkID is updated, this includes the first initialization of the contract
This event is intended to be emitted for every upgrade of the contract with relevant changes for the nodes*


```solidity
event UpdateZkEVMVersion(uint64 numBatch, uint64 forkID, string version);
```

## Structs
### BatchData
Struct which will be used to call sequenceBatches


```solidity
struct BatchData {
    bytes transactions;
    bytes32 globalExitRoot;
    uint64 timestamp;
    uint64 minForcedTimestamp;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`transactions`|`bytes`|L2 ethereum transactions EIP-155 or pre-EIP-155 with signature: EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s|
|`globalExitRoot`|`bytes32`|Global exit root of the batch|
|`timestamp`|`uint64`|Sequenced timestamp of the batch|
|`minForcedTimestamp`|`uint64`|Minimum timestamp of the force batch data, empty when non forced batch|

### ForcedBatchData
Struct which will be used to call sequenceForceBatches


```solidity
struct ForcedBatchData {
    bytes transactions;
    bytes32 globalExitRoot;
    uint64 minForcedTimestamp;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`transactions`|`bytes`|L2 ethereum transactions EIP-155 or pre-EIP-155 with signature: EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s|
|`globalExitRoot`|`bytes32`|Global exit root of the batch|
|`minForcedTimestamp`|`uint64`|Indicates the minimum sequenced timestamp of the batch|

### SequencedBatchData
Struct which will be stored for every batch sequence


```solidity
struct SequencedBatchData {
    bytes32 accInputHash;
    uint64 sequencedTimestamp;
    uint64 previousLastBatchSequenced;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`accInputHash`|`bytes32`|Hash chain that contains all the information to process a batch: keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)|
|`sequencedTimestamp`|`uint64`|Sequenced timestamp|
|`previousLastBatchSequenced`|`uint64`|Previous last batch sequenced before the current one, this is used to properly calculate the fees|

### PendingState
Struct to store the pending states
Pending state will be an intermediary state, that after a timeout can be consolidated, which means that will be added
to the state root mapping, and the global exit root will be updated
This is a protection mechanism against soundness attacks, that will be turned off in the future


```solidity
struct PendingState {
    uint64 timestamp;
    uint64 lastVerifiedBatch;
    bytes32 exitRoot;
    bytes32 stateRoot;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`timestamp`|`uint64`|Timestamp where the pending state is added to the queue|
|`lastVerifiedBatch`|`uint64`|Last batch verified batch of this pending state|
|`exitRoot`|`bytes32`|Pending exit root|
|`stateRoot`|`bytes32`|Pending state root|

### InitializePackedParameters
Struct to call initialize, this saves gas because pack the parameters and avoid stack too deep errors.


```solidity
struct InitializePackedParameters {
    address admin;
    address trustedSequencer;
    uint64 pendingStateTimeout;
    address trustedAggregator;
    uint64 trustedAggregatorTimeout;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`admin`|`address`|Admin address|
|`trustedSequencer`|`address`|Trusted sequencer address|
|`pendingStateTimeout`|`uint64`|Pending state timeout|
|`trustedAggregator`|`address`|Trusted aggregator|
|`trustedAggregatorTimeout`|`uint64`|Trusted aggregator timeout|

