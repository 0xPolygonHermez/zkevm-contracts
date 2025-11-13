# AggchainFEP
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/aggchains/AggchainFEP.sol)

**Inherits:**
[AggchainBase](/contracts/v2/lib/AggchainBase.sol/abstract.AggchainBase.md)

Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol

*this contract aims to be the implementation of a FEP chain that is attached to the aggLayer
contract is responsible for managing the states and the updates of a L2 network*

**Note:**
implementation: 


## State Variables
### _initializerVersion
Value to detect if the contract has been initialized previously.
This mechanism is used to migrate chains that have been already
initialized with a 'PolygonPessimisticConsensus' implementation


```solidity
uint8 private transient _initializerVersion;
```


### AGGCHAIN_TYPE

```solidity
bytes2 public constant AGGCHAIN_TYPE = 0x0001;
```


### version
Op L2OO Semantic version.

**Note:**
semver: v2.0.0


```solidity
string public constant version = "v2.0.0";
```


### l2Outputs
An array of L2 output proposals.

*Same approach from https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol*

*This limits the ability to increase struct OutputProposal parameters in future upgrades*

*Not changed to a mapping style to maintain same storage slots as the original contract*


```solidity
OutputProposal[] internal l2Outputs;
```


### startingBlockNumber
The number of the first L2 block recorded in this contract.


```solidity
uint256 public startingBlockNumber;
```


### startingTimestamp
The timestamp of the first L2 block recorded in this contract.


```solidity
uint256 public startingTimestamp;
```


### submissionInterval
The minimum interval in L2 blocks at which checkpoints must be submitted.


```solidity
uint256 public submissionInterval;
```


### l2BlockTime
The time between L2 blocks in seconds. Once set, this value MUST NOT be modified.


```solidity
uint256 public l2BlockTime;
```


### aggregationVkey
The verification key of the aggregation SP1 program.


```solidity
bytes32 public aggregationVkey;
```


### rangeVkeyCommitment
The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program. Specifically,
this verification is the output of converting the [u32; 8] range BabyBear verification key to a [u8; 32] array.


```solidity
bytes32 public rangeVkeyCommitment;
```


### rollupConfigHash
The hash of the chain's rollup configuration


```solidity
bytes32 public rollupConfigHash;
```


### optimisticMode
Activate optimistic mode. When true, the chain can bypass the state transition verification
and a trustedSequencer signature is needed to do a state transition.


```solidity
bool public optimisticMode;
```


### optimisticModeManager
Address that can trigger the optimistic mode
This mode should be used when the chain is in a state that is not possible to verify and it should be treated as an emergency mode


```solidity
address public optimisticModeManager;
```


### pendingOptimisticModeManager
This account will be able to accept the optimisticModeManager role


```solidity
address public pendingOptimisticModeManager;
```


## Functions
### getInitializedVersion

*Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.*


```solidity
modifier getInitializedVersion();
```

### onlyOptimisticModeManager

*Only allows a function to be callable if the message sender is the optimistic mode manager*


```solidity
modifier onlyOptimisticModeManager();
```

### constructor

Constructor AggchainFEP contract


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager,
    IAggLayerGateway _aggLayerGateway
) AggchainBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManager`|Global exit root manager address|
|`_aggLayerGateway`|`IAggLayerGateway`|agglayer gateway address|


### initialize

Initialize function for the contract.

**Note:**
security: First initialization takes into account this contracts and all the inheritance contracts
Second initialization does not initialize PolygonConsensusBase parameters
Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus


```solidity
function initialize(bytes memory initializeBytesAggchain)
    external
    onlyAggchainManager
    getInitializedVersion
    reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`initializeBytesAggchain`|`bytes`|Encoded bytes to initialize the aggchain|


### _initializeAggchain

Initializer AggchainFEP storage


```solidity
function _initializeAggchain(InitParams memory _initParams) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_initParams`|`InitParams`|The initialization parameters for the contract.|


### getAggchainHash

Callback while pessimistic proof is being verified from the rollup manager

Returns the aggchain hash for a given aggchain data
aggchain_hash:
Field:           | CONSENSUS_TYPE | aggchain_vkey  | aggchain_params  |
length (bits):   | 32             | 256            | 256              |
aggchain_params:
Field:           | l2PreRoot         | claimRoot          | claimBlockNum      | rollupConfigHash     | optimisticMode  | trustedSequencer | rangeVkeyCommitment | aggregationVkey |
length (bits):   | 256               | 256                | 256                | 256                  | 8               | 160              | 256                 | 256             |


```solidity
function getAggchainHash(bytes memory aggchainData) external view returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|custom bytes provided by the chain aggchainData: Field:           | _aggchainVKeyVersion | _outputRoot  | _l2BlockNumber | length (bits):   | 16                   | 256          | 256            | aggchainData._aggchainVKeyVersion First 2 bytes of the aggchain vkey selector aggchainData._outputRoot Proposed new output root aggchainData._l2BlockNumber Proposed new l2 bock number|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainHash resulting aggchain hash|


### SUBMISSION_INTERVAL

Getter for the submissionInterval.
Public getter is legacy and will be removed in the future. Use `submissionInterval` instead.


```solidity
function SUBMISSION_INTERVAL() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Submission interval.|


### L2_BLOCK_TIME

Getter for the l2BlockTime.
Public getter is legacy and will be removed in the future. Use `l2BlockTime` instead.


```solidity
function L2_BLOCK_TIME() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|L2 block time.|


### getL2Output

Returns an output by index. Needed to return a struct instead of a tuple.


```solidity
function getL2Output(uint256 _l2OutputIndex) external view returns (OutputProposal memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_l2OutputIndex`|`uint256`|Index of the output to return.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`OutputProposal`|l2Output The output at the given index.|


### latestOutputIndex

Returns the number of outputs that have been proposed.
Will revert if no outputs have been proposed yet.


```solidity
function latestOutputIndex() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|latestOutputIndex The number of outputs that have been proposed.|


### nextOutputIndex

Returns the index of the next output to be proposed.


```solidity
function nextOutputIndex() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|nextOutputIndex The index of the next output to be proposed.|


### latestBlockNumber

Returns the block number of the latest submitted L2 output proposal.
If no proposals been submitted yet then this function will return the starting
block number.


```solidity
function latestBlockNumber() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|latestBlockNumber Latest submitted L2 block number.|


### nextBlockNumber

Computes the block number of the next L2 block that needs to be checkpointed.


```solidity
function nextBlockNumber() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|nextBlockNumber Next L2 block number.|


### computeL2Timestamp

Returns the L2 timestamp corresponding to a given L2 block number.


```solidity
function computeL2Timestamp(uint256 _l2BlockNumber) public view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_l2BlockNumber`|`uint256`|The L2 block number of the target block.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|L2timestamp timestamp of the given block.|


### onVerifyPessimistic

Callback when pessimistic proof is verified, can only be called by the rollup manager
Stores the necessary chain data when the pessimistic proof is verified


```solidity
function onVerifyPessimistic(bytes memory aggchainData) external onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Custom data provided by the chain|


### updateSubmissionInterval

Update the submission interval.


```solidity
function updateSubmissionInterval(uint256 _submissionInterval) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_submissionInterval`|`uint256`|The new submission interval.|


### updateAggregationVkey

Updates the aggregation verification key.


```solidity
function updateAggregationVkey(bytes32 _aggregationVkey) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_aggregationVkey`|`bytes32`|The new aggregation verification key.|


### updateRangeVkeyCommitment

Updates the range verification key commitment.


```solidity
function updateRangeVkeyCommitment(bytes32 _rangeVkeyCommitment) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rangeVkeyCommitment`|`bytes32`|The new range verification key commitment.|


### updateRollupConfigHash

Updates the rollup config hash.


```solidity
function updateRollupConfigHash(bytes32 _rollupConfigHash) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupConfigHash`|`bytes32`|The new rollup config hash.|


### enableOptimisticMode

Enables optimistic mode.


```solidity
function enableOptimisticMode() external onlyOptimisticModeManager;
```

### disableOptimisticMode

Disables optimistic mode.


```solidity
function disableOptimisticMode() external onlyOptimisticModeManager;
```

### transferOptimisticModeManagerRole

Starts the optimisticModeManager role transfer
This is a two step process, the pending optimisticModeManager must accepted to finalize the process


```solidity
function transferOptimisticModeManagerRole(address newOptimisticModeManager) external onlyOptimisticModeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOptimisticModeManager`|`address`|Address of the new optimisticModeManager|


### acceptOptimisticModeManagerRole

Allow the current pending optimisticModeManager to accept the optimisticModeManager role


```solidity
function acceptOptimisticModeManagerRole() external;
```

## Events
### OutputProposed
Emitted when an FEP is verified.


```solidity
event OutputProposed(
    bytes32 indexed outputRoot, uint256 indexed l2OutputIndex, uint256 indexed l2BlockNumber, uint256 l1Timestamp
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`outputRoot`|`bytes32`|   The output root.|
|`l2OutputIndex`|`uint256`|The index of the output in the l2Outputs array.|
|`l2BlockNumber`|`uint256`|The L2 block number of the output root.|
|`l1Timestamp`|`uint256`|  The L1 timestamp when proposed.|

### RollupConfigHashUpdated
Emitted when the rollup config hash is updated.


```solidity
event RollupConfigHashUpdated(bytes32 indexed oldRollupConfigHash, bytes32 indexed newRollupConfigHash);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldRollupConfigHash`|`bytes32`|The old rollup config hash.|
|`newRollupConfigHash`|`bytes32`|The new rollup config hash.|

### SubmissionIntervalUpdated
Emitted when the submission interval is updated.


```solidity
event SubmissionIntervalUpdated(uint256 oldSubmissionInterval, uint256 newSubmissionInterval);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldSubmissionInterval`|`uint256`|The old submission interval.|
|`newSubmissionInterval`|`uint256`|The new submission interval.|

### EnableOptimisticMode
Emitted when the optimistic mode is enabled.


```solidity
event EnableOptimisticMode();
```

### DisableOptimisticMode
Emitted when the optimistic mode is disabled.


```solidity
event DisableOptimisticMode();
```

### TransferOptimisticModeManagerRole
*Emitted when the optimisticModeManager starts the two-step transfer role setting a new pending optimisticModeManager*


```solidity
event TransferOptimisticModeManagerRole(address currentOptimisticModeManager, address newPendingOptimisticModeManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentOptimisticModeManager`|`address`|The current pending optimisticModeManager|
|`newPendingOptimisticModeManager`|`address`|The new pending optimisticModeManager|

### AcceptOptimisticModeManagerRole
Emitted when the pending optimisticModeManager accepts the optimisticModeManager role


```solidity
event AcceptOptimisticModeManagerRole(address oldOptimisticModeManager, address newOptimisticModeManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldOptimisticModeManager`|`address`|The old optimisticModeManager|
|`newOptimisticModeManager`|`address`|The new optimisticModeManager|

### AggregationVkeyUpdated
Emitted when the aggregation verification key is updated.


```solidity
event AggregationVkeyUpdated(bytes32 indexed oldAggregationVkey, bytes32 indexed newAggregationVkey);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldAggregationVkey`|`bytes32`|The old aggregation verification key.|
|`newAggregationVkey`|`bytes32`|The new aggregation verification key.|

### RangeVkeyCommitmentUpdated
Emitted when the range verification key commitment is updated.


```solidity
event RangeVkeyCommitmentUpdated(bytes32 indexed oldRangeVkeyCommitment, bytes32 indexed newRangeVkeyCommitment);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldRangeVkeyCommitment`|`bytes32`|The old range verification key commitment.|
|`newRangeVkeyCommitment`|`bytes32`|The new range verification key commitment.|

## Errors
### OptimisticModeNotEnabled
optimistic mode is not enabled.


```solidity
error OptimisticModeNotEnabled();
```

### OptimisticModeEnabled
optimistic mode is enabled.


```solidity
error OptimisticModeEnabled();
```

### SubmissionIntervalMustBeGreaterThanZero
submission interval must be greater than 0.


```solidity
error SubmissionIntervalMustBeGreaterThanZero();
```

### L2BlockTimeMustBeGreaterThanZero
L2 block time must be greater than 0


```solidity
error L2BlockTimeMustBeGreaterThanZero();
```

### StartL2TimestampMustBeLessThanCurrentTime
starting L2 timestamp must be less than current time


```solidity
error StartL2TimestampMustBeLessThanCurrentTime();
```

### RollupConfigHashMustBeDifferentThanZero
rollup config hash must be different than 0


```solidity
error RollupConfigHashMustBeDifferentThanZero();
```

### RangeVkeyCommitmentMustBeDifferentThanZero
range vkey commitment must be different than 0


```solidity
error RangeVkeyCommitmentMustBeDifferentThanZero();
```

### AggregationVkeyMustBeDifferentThanZero
aggregation vkey must be different than 0


```solidity
error AggregationVkeyMustBeDifferentThanZero();
```

### L2BlockNumberLessThanNextBlockNumber
block number must be greater than or equal to next expected block number.


```solidity
error L2BlockNumberLessThanNextBlockNumber();
```

### CannotProposeFutureL2Output
cannot propose L2 output in the future


```solidity
error CannotProposeFutureL2Output();
```

### L2OutputRootCannotBeZero
L2 output proposal cannot be the zero hash


```solidity
error L2OutputRootCannotBeZero();
```

### OnlyOptimisticModeManager
Thrown when the caller is not the optimistic mode manager


```solidity
error OnlyOptimisticModeManager();
```

### OnlyPendingOptimisticModeManager
Thrown when the caller is not the pending optimistic mode manager


```solidity
error OnlyPendingOptimisticModeManager();
```

### InvalidInitializer
Thrown when trying to initialize the wrong initialize function.


```solidity
error InvalidInitializer();
```

## Structs
### InitParams
Parameters to initialize the AggchainFEP contract.


```solidity
struct InitParams {
    uint256 l2BlockTime;
    bytes32 rollupConfigHash;
    bytes32 startingOutputRoot;
    uint256 startingBlockNumber;
    uint256 startingTimestamp;
    uint256 submissionInterval;
    address optimisticModeManager;
    bytes32 aggregationVkey;
    bytes32 rangeVkeyCommitment;
}
```

### OutputProposal
OutputProposal represents a commitment to the L2 state. The timestamp is the L1
timestamp that the output root is posted.

**Notes:**
- field: outputRoot    Hash of the L2 output.

- field: timestamp     Timestamp of the L1 block that the output root was submitted in.

- field: l2BlockNumber L2 block number that the output corresponds to.


```solidity
struct OutputProposal {
    bytes32 outputRoot;
    uint128 timestamp;
    uint128 l2BlockNumber;
}
```

