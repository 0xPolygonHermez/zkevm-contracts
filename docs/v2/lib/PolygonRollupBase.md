Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridge _bridgeAddress,
    contract PolygonRollupManager _rollupManager
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address
|`_rollupManager` | contract PolygonRollupManager | Global exit root manager address

### initialize
```solidity
  function initialize(
    address _admin,
    address sequencer,
    uint32 networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    string sequencerURL,
    string _networkName
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_admin` | address | Admin address
|`sequencer` | address | Trusted sequencer address
|`networkID` | uint32 | Indicates the network identifier that will be used in the bridge
|`_gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
|`_gasTokenNetwork` | uint32 | Indicates the native network of the token address
|`sequencerURL` | string | Trusted sequencer URL
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct PolygonRollupBase.BatchData[] batches,
    address l2Coinbase
  ) public
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonRollupBase.BatchData[] | Struct array which holds the necessary data to append new batches to the sequence
|`l2Coinbase` | address | Address that will receive the fees from L2

### onVerifyBatches
```solidity
  function onVerifyBatches(
    uint64 lastVerifiedBatch,
    bytes32 newStateRoot,
    address aggregator
  ) public
```
Callback on verify batches, can only be called by the rollup manager


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`lastVerifiedBatch` | uint64 | Last verified batch
|`newStateRoot` | bytes32 | new state root
|`aggregator` | address | Aggregator address

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 polAmount
  ) public
```
Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected
Note The sequencer has certain degree of control on how non-forced and forced batches are ordered
In order to assure that users force transactions will be processed properly, user must not sign any other transaction
with the same nonce


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
|`polAmount` | uint256 | Max amount of pol tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct PolygonRollupBase.ForcedBatchData[] batches
  ) external
```
Allows anyone to sequence forced Batches if the trusted sequencer has not done so in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct PolygonRollupBase.ForcedBatchData[] | Struct array which holds the necessary data to append force batches

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) external
```
Allow the admin to set a new trusted sequencer


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequencer

### setTrustedSequencerURL
```solidity
  function setTrustedSequencerURL(
    string newTrustedSequencerURL
  ) external
```
Allow the admin to set the trusted sequencer URL


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### setForceBatchTimeout
```solidity
  function setForceBatchTimeout(
    uint64 newforceBatchTimeout
  ) external
```
Allow the admin to set the forcedBatchTimeout
The new value can only be lower, except if emergency state is active


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newforceBatchTimeout` | uint64 | New force batch timeout

### activateForceBatches
```solidity
  function activateForceBatches(
  ) external
```
Allow the admin to turn on the force batches
This action is not reversible



### transferAdminRole
```solidity
  function transferAdminRole(
    address newPendingAdmin
  ) external
```
Starts the admin role transfer
This is a two step process, the pending admin must accepted to finalize the process


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingAdmin` | address | Address of the new pending admin

### acceptAdminRole
```solidity
  function acceptAdminRole(
  ) external
```
Allow the current pending admin to accept the admin role



### calculatePolPerForceBatch
```solidity
  function calculatePolPerForceBatch(
  ) public returns (uint256)
```
Function to calculate the reward for a forced batch



### generateInitializeTransaction
```solidity
  function generateInitializeTransaction(
    uint32 networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork
  ) public returns (bytes)
```
Generate Initialize transaction for hte bridge on L2


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`networkID` | uint32 | Indicates the network identifier that will be used in the bridge
|`_gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
|`_gasTokenNetwork` | uint32 | Indicates the native network of the token address

## Events
### SequenceBatches
```solidity
  event SequenceBatches(
  )
```

Emitted when the trusted sequencer sends a new batch of transactions

### ForceBatch
```solidity
  event ForceBatch(
  )
```

Emitted when a batch is forced

### SequenceForceBatches
```solidity
  event SequenceForceBatches(
  )
```

Emitted when forced batches are sequenced by not the trusted sequencer

### VerifyBatches
```solidity
  event VerifyBatches(
  )
```

Emitted when a aggregator verifies batches

### SetTrustedSequencer
```solidity
  event SetTrustedSequencer(
  )
```

Emitted when the admin updates the trusted sequencer address

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when the admin updates the sequencer URL

### SetForceBatchTimeout
```solidity
  event SetForceBatchTimeout(
  )
```

Emitted when the admin update the force batch timeout

### ActivateForceBatches
```solidity
  event ActivateForceBatches(
  )
```

Emitted when activate force batches

### TransferAdminRole
```solidity
  event TransferAdminRole(
  )
```

Emitted when the admin starts the two-step transfer role setting a new pending admin

### AcceptAdminRole
```solidity
  event AcceptAdminRole(
  )
```

Emitted when the pending admin accepts the admin role

