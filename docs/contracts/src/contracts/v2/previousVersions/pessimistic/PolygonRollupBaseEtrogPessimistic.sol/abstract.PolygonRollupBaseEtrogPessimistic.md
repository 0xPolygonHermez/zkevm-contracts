# PolygonRollupBaseEtrogPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/pessimistic/PolygonRollupBaseEtrogPessimistic.sol)

**Inherits:**
[PolygonConsensusBasePessimistic](/contracts/v2/previousVersions/pessimistic/PolygonConsensusBasePessimistic.sol/abstract.PolygonConsensusBasePessimistic.md), [PolygonConstantsBase](/contracts/v2/lib/PolygonConstantsBase.sol/contract.PolygonConstantsBase.md), [IPolygonRollupBase](/contracts/v2/interfaces/IPolygonRollupBase.sol/interface.IPolygonRollupBase.md)

Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## State Variables
### _MAX_TRANSACTIONS_BYTE_LENGTH

```solidity
uint256 internal constant _MAX_TRANSACTIONS_BYTE_LENGTH = 120000;
```


### _MAX_FORCE_BATCH_BYTE_LENGTH

```solidity
uint256 internal constant _MAX_FORCE_BATCH_BYTE_LENGTH = 5000;
```


### INITIALIZE_TX_BRIDGE_LIST_LEN_LEN

```solidity
uint8 public constant INITIALIZE_TX_BRIDGE_LIST_LEN_LEN = 0xf9;
```


### INITIALIZE_TX_BRIDGE_PARAMS

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS = hex"80808401c9c38094";
```


### INITIALIZE_TX_CONSTANT_BYTES

```solidity
uint16 public constant INITIALIZE_TX_CONSTANT_BYTES = 32;
```


### INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS = hex"80b9";
```


### INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA

```solidity
uint16 public constant INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA = 31;
```


### INITIALIZE_TX_DATA_LEN_EMPTY_METADATA

```solidity
uint8 public constant INITIALIZE_TX_DATA_LEN_EMPTY_METADATA = 228;
```


### INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA

```solidity
bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA = hex"80b8";
```


### SIGNATURE_INITIALIZE_TX_V

```solidity
uint8 public constant SIGNATURE_INITIALIZE_TX_V = 27;
```


### SIGNATURE_INITIALIZE_TX_R

```solidity
bytes32 public constant SIGNATURE_INITIALIZE_TX_R = 0x00000000000000000000000000000000000000000000000000000005ca1ab1e0;
```


### SIGNATURE_INITIALIZE_TX_S

```solidity
bytes32 public constant SIGNATURE_INITIALIZE_TX_S = 0x000000000000000000000000000000000000000000000000000000005ca1ab1e;
```


### INITIALIZE_TX_EFFECTIVE_PERCENTAGE

```solidity
bytes1 public constant INITIALIZE_TX_EFFECTIVE_PERCENTAGE = 0xFF;
```


### GLOBAL_EXIT_ROOT_MANAGER_L2

```solidity
IBasePolygonZkEVMGlobalExitRoot public constant GLOBAL_EXIT_ROOT_MANAGER_L2 =
    IBasePolygonZkEVMGlobalExitRoot(0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA);
```


### TIMESTAMP_RANGE

```solidity
uint256 public constant TIMESTAMP_RANGE = 36;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManagerPessimistic _rollupManager
) PolygonConsensusBasePessimistic(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManagerPessimistic`|Global exit root manager address|


### initialize


```solidity
function initialize(
    address _admin,
    address sequencer,
    uint32 networkID,
    address _gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName
) external override(IPolygonConsensusBase, PolygonConsensusBasePessimistic) onlyRollupManager initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`sequencer`|`address`|Trusted sequencer address|
|`networkID`|`uint32`|Indicates the network identifier that will be used in the bridge|
|`_gasTokenAddress`|`address`|Indicates the token address in mainnet that will be used as a gas token Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead|
|`sequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|


### onlyTrustedSequencer


```solidity
modifier onlyTrustedSequencer();
```

### isSenderAllowedToForceBatches


```solidity
modifier isSenderAllowedToForceBatches();
```

### sequenceBatches

Allows a sequencer to send multiple batches


```solidity
function sequenceBatches(
    BatchData[] calldata batches,
    uint32 l1InfoTreeLeafCount,
    uint64 maxSequenceTimestamp,
    bytes32 expectedFinalAccInputHash,
    address l2Coinbase
) public virtual onlyTrustedSequencer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`BatchData[]`|Struct array which holds the necessary data to append new batches to the sequence|
|`l1InfoTreeLeafCount`|`uint32`|Count of the L1InfoTree leaf that will be used in this sequence|
|`maxSequenceTimestamp`|`uint64`|Max timestamp of the sequence. This timestamp must be inside a safety range (actual + 36 seconds). This timestamp should be equal or higher of the last block inside the sequence, otherwise this batch will be invalidated by circuit.|
|`expectedFinalAccInputHash`|`bytes32`|This parameter must match the acc input hash after hash all the batch data This will be a protection for the sequencer to avoid sending undesired data|
|`l2Coinbase`|`address`|Address that will receive the fees from L2 note Pol is not a reentrant token|


### onVerifyBatches

Callback on verify batches, can only be called by the rollup manager


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator)
    public
    virtual
    override
    onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`lastVerifiedBatch`|`uint64`|Last verified batch|
|`newStateRoot`|`bytes32`|new state root|
|`aggregator`|`address`|Aggregator address|


### rollbackBatches

Callback on rollback batches, can only be called by the rollup manager


```solidity
function rollbackBatches(uint64 targetBatch, bytes32 accInputHashToRollback)
    public
    virtual
    override
    onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`targetBatch`|`uint64`|Batch to rollback up to but not including this batch|
|`accInputHashToRollback`|`bytes32`|Acc input hash to rollback|


### forceBatch

Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected
Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
In order to assure that users force transactions will be processed properly, user must not sign any other transaction
with the same nonce


```solidity
function forceBatch(bytes calldata transactions, uint256 polAmount) public virtual isSenderAllowedToForceBatches;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`transactions`|`bytes`|L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:|
|`polAmount`|`uint256`|Max amount of pol tokens that the sender is willing to pay|


### sequenceForceBatches

Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


```solidity
function sequenceForceBatches(BatchData[] calldata batches) external virtual isSenderAllowedToForceBatches;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`batches`|`BatchData[]`|Struct array which holds the necessary data to append force batches|


### setForceBatchAddress

Allow the admin to change the force batch address, that will be allowed to force batches
If address 0 is set, then everyone is able to force batches, this action is irreversible


```solidity
function setForceBatchAddress(address newForceBatchAddress) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newForceBatchAddress`|`address`|New force batch address|


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


### calculatePolPerForceBatch

Function to calculate the reward for a forced batch


```solidity
function calculatePolPerForceBatch() public view returns (uint256);
```

### generateInitializeTransaction

Generate Initialize transaction for hte bridge on L2


```solidity
function generateInitializeTransaction(
    uint32 networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    bytes memory _gasTokenMetadata
) public view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`networkID`|`uint32`|Indicates the network identifier that will be used in the bridge|
|`_gasTokenAddress`|`address`|Indicates the token address that will be used to pay gas fees in the new rollup|
|`_gasTokenNetwork`|`uint32`|Indicates the native network of the token address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|


### _verifyOrigin


```solidity
function _verifyOrigin(address _gasTokenAddress) internal virtual returns (bytes memory gasTokenMetadata);
```

## Events
### SequenceBatches
*Emitted when the trusted sequencer sends a new batch of transactions*


```solidity
event SequenceBatches(uint64 indexed numBatch, bytes32 l1InfoRoot);
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

### InitialSequenceBatches
*Emitted when the contract is initialized, contain the first sequenced transaction*


```solidity
event InitialSequenceBatches(bytes transactions, bytes32 lastGlobalExitRoot, address sequencer);
```

### VerifyBatches
*Emitted when a aggregator verifies batches*


```solidity
event VerifyBatches(uint64 indexed numBatch, bytes32 stateRoot, address indexed aggregator);
```

### RollbackBatches
*Emitted when a aggregator verifies batches*


```solidity
event RollbackBatches(uint64 indexed targetBatch, bytes32 accInputHashToRollback);
```

### SetForceBatchTimeout
*Emitted when the admin update the force batch timeout*


```solidity
event SetForceBatchTimeout(uint64 newforceBatchTimeout);
```

### SetForceBatchAddress
*Emitted when the admin update the force batch address*


```solidity
event SetForceBatchAddress(address newForceBatchAddress);
```

## Structs
### BatchData
Struct which will be used to call sequenceBatches


```solidity
struct BatchData {
    bytes transactions;
    bytes32 forcedGlobalExitRoot;
    uint64 forcedTimestamp;
    bytes32 forcedBlockHashL1;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`transactions`|`bytes`|L2 ethereum transactions EIP-155 or pre-EIP-155 with signature: EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s|
|`forcedGlobalExitRoot`|`bytes32`|Global exit root, empty when sequencing a non forced batch|
|`forcedTimestamp`|`uint64`|Minimum timestamp of the force batch data, empty when sequencing a non forced batch|
|`forcedBlockHashL1`|`bytes32`|blockHash snapshot of the force batch data, empty when sequencing a non forced batch|

