# AggchainFEP
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/aggchains/AggchainFEP.sol)

**Inherits:**
[AggchainBase](/contracts/lib/AggchainBase.sol/abstract.AggchainBase.md)

**Title:**
AggchainFEP

Heavily based on https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol

This contract aims to be the implementation of a FEP chain that is attached to the aggLayer
contract is responsible for managing the states and the updates of a L2 network

**Note:**
implementation: 


## State Variables
### _initializerVersion
Value to detect if the contract has been initialized previously.
This mechanism is used to migrate chains that have been already
initialized with a 'PolygonPessimisticConsensus' implementation


```solidity
uint8 private transient _initializerVersion
```


### AGGCHAIN_TYPE

```solidity
bytes2 public constant AGGCHAIN_TYPE = 0x0001
```


### AGGCHAIN_FEP_VERSION
Op L2OO Semantic version.

**Note:**
semver: v3.0.0


```solidity
string public constant AGGCHAIN_FEP_VERSION = "v3.0.0"
```


### GENESIS_CONFIG_NAME
The genesis configuration name.


```solidity
bytes32 public constant GENESIS_CONFIG_NAME = keccak256("opsuccinct_genesis")
```


### l2Outputs
An array of L2 output proposals.

Same approach from https://github.com/succinctlabs/op-succinct/blob/main/contracts/src/validity/OPSuccinctL2OutputOracle.sol

This limits the ability to increase struct OutputProposal parameters in future upgrades

Not changed to a mapping style to maintain same storage slots as the original contract


```solidity
OutputProposal[] internal l2Outputs
```


### startingBlockNumber
The number of the first L2 block recorded in this contract.


```solidity
uint256 public startingBlockNumber
```


### startingTimestamp
The timestamp of the first L2 block recorded in this contract.


```solidity
uint256 public startingTimestamp
```


### submissionInterval
The minimum interval in L2 blocks at which checkpoints must be submitted.


```solidity
uint256 public submissionInterval
```


### l2BlockTime
The time between L2 blocks in seconds. Once set, this value MUST NOT be modified.


```solidity
uint256 public l2BlockTime
```


### aggregationVkey
The verification key of the aggregation SP1 program.


```solidity
bytes32 public aggregationVkey
```


### rangeVkeyCommitment
The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program. Specifically,
this verification key is the output of converting the [u32; 8] range BabyBear verification key to a [u8; 32] array.


```solidity
bytes32 public rangeVkeyCommitment
```


### rollupConfigHash
The hash of the chain's rollup configuration


```solidity
bytes32 public rollupConfigHash
```


### optimisticMode
Activate optimistic mode. When true, the chain can bypass the state transition verification
and a trustedSequencer signature is needed to do a state transition.


```solidity
bool public optimisticMode
```


### optimisticModeManager
Address that can trigger the optimistic mode
This mode should be used when the chain is in a state that is not possible to verify and it should be treated as an emergency mode


```solidity
address public optimisticModeManager
```


### pendingOptimisticModeManager
This account will be able to accept the optimisticModeManager role


```solidity
address public pendingOptimisticModeManager
```


### opSuccinctConfigs
Mapping of configuration names to OpSuccinctConfig structs.


```solidity
mapping(bytes32 => OpSuccinctConfig) public opSuccinctConfigs
```


### selectedOpSuccinctConfigName
The name of the current OP Succinct configuration to use for the next submission.


```solidity
bytes32 public selectedOpSuccinctConfigName
```


## Functions
### getInitializedVersion

Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.


```solidity
modifier getInitializedVersion() ;
```

### onlyOptimisticModeManager

Only allows a function to be callable if the message sender is the optimistic mode manager


```solidity
modifier onlyOptimisticModeManager() ;
```

### constructor

Constructor AggchainFEP contract


```solidity
constructor(
    IAgglayerGER _globalExitRootManager,
    IERC20Upgradeable _pol,
    IAgglayerBridge _bridgeAddress,
    AgglayerManager _rollupManager,
    IAgglayerGateway _aggLayerGateway
) AggchainBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IAgglayerGER`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IAgglayerBridge`|Bridge address|
|`_rollupManager`|`AgglayerManager`|Global exit root manager address|
|`_aggLayerGateway`|`IAgglayerGateway`|agglayer gateway address|


### initialize

Initialize function for fresh deployment

**Note:**
security: Initializes all contracts including PolygonConsensusBase


```solidity
function initialize(
    InitParams memory _initParams,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold,
    bool _useDefaultVkeys,
    bool _useDefaultSigners,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector,
    address _admin,
    address _trustedSequencer,
    address _gasTokenAddress,
    string memory _trustedSequencerURL,
    string memory _networkName
) external onlyAggchainManager getInitializedVersion reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_initParams`|`InitParams`|The initialization parameters for FEP|
|`_signersToAdd`|`SignerInfo[]`|Array of signers to add to the multisig|
|`_newThreshold`|`uint256`|New threshold for multisig operations|
|`_useDefaultVkeys`|`bool`|Whether to use default verification keys from gateway|
|`_useDefaultSigners`|`bool`|Whether to use default signers from gateway|
|`_initOwnedAggchainVKey`|`bytes32`|The owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|The aggchain verification key selector|
|`_admin`|`address`|The admin address|
|`_trustedSequencer`|`address`|The trusted sequencer address|
|`_gasTokenAddress`|`address`|The gas token address|
|`_trustedSequencerURL`|`string`|The trusted sequencer URL|
|`_networkName`|`string`|The network name|


### initializeFromLegacyConsensus

Initialize function for upgrade from PolygonPessimisticConsensus or PolygonRollupBaseEtrog

**Note:**
security: Only initializes FEP and AggchainBase params, not PolygonConsensusBase


```solidity
function initializeFromLegacyConsensus(
    InitParams memory _initParams,
    bool _useDefaultVkeys,
    bool _useDefaultSigners,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold
) external onlyAggchainManager getInitializedVersion reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_initParams`|`InitParams`|The initialization parameters for FEP|
|`_useDefaultVkeys`|`bool`|Whether to use default verification keys from gateway|
|`_useDefaultSigners`|`bool`|Whether to use default signers from gateway|
|`_initOwnedAggchainVKey`|`bytes32`|The owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|The aggchain verification key selector|
|`_signersToAdd`|`SignerInfo[]`|Array of signers to add to the multisig|
|`_newThreshold`|`uint256`|New threshold for multisig operations|


### initializeFromECDSAMultisig

Initialize function for upgrade from AggchainECDSAMultisig to AggchainFEP

Used when transitioning from ECDSA multisig to FEP verification

**Note:**
security: Only initializes FEP specific parameters, assumes base and consensus are already initialized


```solidity
function initializeFromECDSAMultisig(
    InitParams memory _initParams,
    bool _useDefaultVkeys,
    bytes32 _initOwnedAggchainVKey,
    bytes4 _initAggchainVKeySelector
) external onlyAggchainManager getInitializedVersion reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_initParams`|`InitParams`|The initialization parameters for FEP|
|`_useDefaultVkeys`|`bool`|Whether to use default verification keys from gateway|
|`_initOwnedAggchainVKey`|`bytes32`|The owned aggchain verification key|
|`_initAggchainVKeySelector`|`bytes4`|The aggchain verification key selector|


### upgradeFromPreviousFEP

Upgrade function from a previous FEP version

Preserves existing configuration by moving it to genesis config slot

**Note:**
security: Migrates existing FEP configuration to new format with genesis config and multisig


```solidity
function upgradeFromPreviousFEP() external onlyRollupManager getInitializedVersion reinitializer(3);
```

### _initializeAggchain

Initializer AggchainFEP storage

Internal function to set up FEP-specific parameters. Validates all parameters before setting.


```solidity
function _initializeAggchain(InitParams memory _initParams) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_initParams`|`InitParams`|The initialization parameters for the contract|


### getVKeyAndAggchainParams

Abstract function to extract aggchain parameters and verification key from aggchain data

Validates the provided aggchain data and returns the computed aggchain parameters and vkey
aggchain_params:
Field:           | l2PreRoot         | claimRoot          | claimBlockNum      | rollupConfigHash     | optimisticMode  | trustedSequencer | rangeVkeyCommitment | aggregationVkey |
length (bits):   | 256               | 256                | 256                | 256                  | 8               | 160              | 256                 | 256             |


```solidity
function getVKeyAndAggchainParams(bytes memory aggchainData) public view override returns (bytes32, bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|custom bytes provided by the chain, encoded in ABI solidity format aggchainData: Field:                  | _aggchainVKeySelector | _outputRoot  | _l2BlockNumber | length (bits):          | 32                    | 256          | 256            | ABI encoding (bits):    | 256                   | 256          | 256            | aggchainData._aggchainVKeySelector First 4 bytes of the aggchain vkey selector aggchainData._outputRoot Proposed new output root aggchainData._l2BlockNumber Proposed new l2 block number|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainVKey The aggchain verification key decoded from the input data|
|`<none>`|`bytes32`|aggchainParams The computed aggchain parameters hash|


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
|`aggchainData`|`bytes`|Custom data provided by the chain containing outputRoot and l2BlockNumber|


### isValidOpSuccinctConfig

Validates that an OpSuccinctConfig has all non-zero parameters.


```solidity
function isValidOpSuccinctConfig(OpSuccinctConfig memory _config) public pure returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_config`|`OpSuccinctConfig`|The OpSuccinctConfig to validate.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if all parameters are non-zero, false otherwise.|


### addOpSuccinctConfig

Updates or creates an OP Succinct configuration

Validates all parameters are non-zero before adding


```solidity
function addOpSuccinctConfig(
    bytes32 _configName,
    bytes32 _rollupConfigHash,
    bytes32 _aggregationVkey,
    bytes32 _rangeVkeyCommitment
) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_configName`|`bytes32`|The name of the configuration|
|`_rollupConfigHash`|`bytes32`|The rollup config hash|
|`_aggregationVkey`|`bytes32`|The aggregation verification key|
|`_rangeVkeyCommitment`|`bytes32`|The range verification key commitment|


### deleteOpSuccinctConfig

Deletes an OP Succinct configuration


```solidity
function deleteOpSuccinctConfig(bytes32 _configName) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_configName`|`bytes32`|The name of the configuration to delete|


### selectOpSuccinctConfig

Sets the OP Succinct configuration to use for the next submission

Validates the configuration exists before setting it as selected


```solidity
function selectOpSuccinctConfig(bytes32 _configName) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_configName`|`bytes32`|The name of the configuration to use|


### updateSubmissionInterval

Update the submission interval

Must be greater than zero


```solidity
function updateSubmissionInterval(uint256 _submissionInterval) external onlyAggchainManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_submissionInterval`|`uint256`|The new submission interval in L2 blocks|


### enableOptimisticMode

Enables optimistic mode

When enabled, the chain can bypass state transition verification


```solidity
function enableOptimisticMode() external onlyOptimisticModeManager;
```

### disableOptimisticMode

Disables optimistic mode

Returns to normal verification mode


```solidity
function disableOptimisticMode() external onlyOptimisticModeManager;
```

### transferOptimisticModeManagerRole

Starts the optimisticModeManager role transfer

This is a two step process, the pending optimisticModeManager must accept to finalize the process


```solidity
function transferOptimisticModeManagerRole(address newOptimisticModeManager) external onlyOptimisticModeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOptimisticModeManager`|`address`|Address of the new optimisticModeManager|


### acceptOptimisticModeManagerRole

Allow the current pending optimisticModeManager to accept the optimisticModeManager role

Can only be called by the pending optimisticModeManager


```solidity
function acceptOptimisticModeManagerRole() external;
```

### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version of the contract.|


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
Emitted when the optimisticModeManager starts the two-step transfer role setting a new pending optimisticModeManager


```solidity
event TransferOptimisticModeManagerRole(
    address currentOptimisticModeManager, address newPendingOptimisticModeManager
);
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

### OpSuccinctConfigUpdated
Emitted when an OP Succinct configuration is updated.


```solidity
event OpSuccinctConfigUpdated(
    bytes32 indexed configName, bytes32 aggregationVkey, bytes32 rangeVkeyCommitment, bytes32 rollupConfigHash
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`configName`|`bytes32`|The name of the configuration.|
|`aggregationVkey`|`bytes32`|The aggregation verification key.|
|`rangeVkeyCommitment`|`bytes32`|The range verification key commitment.|
|`rollupConfigHash`|`bytes32`|The rollup config hash.|

### OpSuccinctConfigDeleted
Emitted when an OP Succinct configuration is deleted.


```solidity
event OpSuccinctConfigDeleted(bytes32 indexed configName);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`configName`|`bytes32`|The name of the configuration that was deleted.|

### OpSuccinctConfigSelected
Emitted when the current OP Succinct configuration is set for use.


```solidity
event OpSuccinctConfigSelected(bytes32 indexed configName);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`configName`|`bytes32`|The name of the configuration that was set for use.|

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

### ConfigDoesNotExist
Thrown when the config does not exist


```solidity
error ConfigDoesNotExist();
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

### OpSuccinctConfig
Configuration parameters for OP Succinct verification.


```solidity
struct OpSuccinctConfig {
    /// @notice The verification key of the aggregation SP1 program.
    bytes32 aggregationVkey;
    /// @notice The 32 byte commitment to the BabyBear representation of the verification key of
    /// the range SP1 program. Specifically, this verification key is the output of converting
    /// the [u32; 8] range BabyBear verification key to a [u8; 32] array.
    bytes32 rangeVkeyCommitment;
    /// @notice The hash of the chain's rollup config, which ensures the proofs submitted are for
    /// the correct chain. This is used to prevent replay attacks.
    bytes32 rollupConfigHash;
}
```

