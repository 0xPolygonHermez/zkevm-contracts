Contract responsible for managing the state and the updates of it of the L2 Hermez network.
There will be trusted sequencer, wich are able to send transactions.
Any user can force some transaction and the sequence will have a timeout to add them in the queue
THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
The aggregators will be able to actually verify the sequenced state with zkProofs and able withdraws from hermez L2
To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks


## Functions
### constructor
```solidity
  function constructor(
    contract IGlobalExitRootManager _globalExitRootManager,
    contract IERC20 _matic,
    contract IVerifierRollup _rollupVerifier,
    bytes32 genesisRoot
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address
|`_matic` | contract IERC20 | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | rollup verifier address
|`genesisRoot` | bytes32 | rollup genesis root

### sequenceBatches
```solidity
  function sequenceBatches(
    struct ProofOfEfficiency.BatchData[] batches
  ) public
```
Allows a sequencer to send multiple batches of L2 transactions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.BatchData[] | Struct array which the necessary data to append new batces ot the sequence
Global exit root, timestamp and forced batches that are pop form the queue

### verifyBatch
```solidity
  function verifyBatch(
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint64 numBatch,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) public
```
Allows an aggregator to verify a batch


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`numBatch` | uint64 | Batch number that the aggregator intends to verify, used as a sanity check
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 maticAmount
  ) public
```
Allows a sequencer/user to force a batch of L2 transactions,
This tx can be front-runned by the trusted sequencer
This should be used only in extreme cases where the trusted sequencer does not work as expected


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 with signature:
rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    uint64 numForcedBatches
  ) public
```
Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period
Also allow in any time the trusted sequencer to append forceBatches to the sequence in order to avoid timeout issues


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`numForcedBatches` | uint64 | number of forced batches tha will be added to the queue

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) public
```
Allow the current trusted sequencer to set a new trusted sequencer


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequuencer

### setForceBatchAllowed
```solidity
  function setForceBatchAllowed(
    bool _forceBatchAllowed
  ) public
```
Allow the current trusted sequencer to allow/disallow the forceBatch functionality


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_forceBatchAllowed` | bool | Whether is allowed or not the forceBatch functionality

### calculateForceProverFee
```solidity
  function calculateForceProverFee(
  ) public returns (uint256)
```
Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO



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

### VerifyBatch
```solidity
  event VerifyBatch(
  )
```

Emitted when a aggregator verifies a new batch

