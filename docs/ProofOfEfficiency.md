Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network.
To enter and exit of the L2 network, a Bridge smart contract that will be deployed in both networks will be used.


## Functions
### constructor
```solidity
  function constructor(
    contract IGlobalExitRootManager _globalExitRootManager,
    contract IERC20 _matic,
    contract IVerifierRollup _rollupVerifier,
    bytes32 genesisRoot,
    address _trustedSequencer,
    bool _forceBatchAllowed,
    string _trustedSequencerURL
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address
|`_matic` | contract IERC20 | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | rollup verifier address
|`genesisRoot` | bytes32 | rollup genesis root
|`_trustedSequencer` | address | trusted sequencer address
|`_forceBatchAllowed` | bool | indicates wheather the force batch functionality is available
|`_trustedSequencerURL` | string | trusted sequencer URL

### sequenceBatches
```solidity
  function sequenceBatches(
    struct ProofOfEfficiency.BatchData[] batches
  ) public
```
Allows a sequencer to send multiple batches of L2 transactions.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.BatchData[] | Struct array which the necessary data to append new batces ot the sequence
Global exit root, timestamp and forced batches that are pop from the queue

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
Allows an aggregator to verify a batch.


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
Allows a sequencer/user to force a batch of L2 transactions.
This should be used only in extreme cases where the trusted sequencer does not work as expected.


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
Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period.
Also allow in any time the trusted sequencer to append forceBatches to the sequence in order to avoid timeout issues.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`numForcedBatches` | uint64 | number of forced batches that will be added to the sequence

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) public
```
Allow the current trusted sequencer to set a new trusted sequencer.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequuencer

### setForceBatchAllowed
```solidity
  function setForceBatchAllowed(
    bool newForceBatchAllowed
  ) public
```
Allow the current trusted sequencer to allow/disallow the forceBatch functionality.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newForceBatchAllowed` | bool | Whether is allowed or not the forceBatch functionality

### setTrustedSequencerURL
```solidity
  function setTrustedSequencerURL(
    string newTrustedSequencerURL
  ) public
```
Allow the trusted sequencer to set the trusted sequencer URL.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### calculateForceProverFee
```solidity
  function calculateForceProverFee(
  ) public returns (uint256)
```
Function to calculate the sequencer collateral depending on the congestion of the batches.
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

Emitted when a aggregator verifies a new batch.

### SetTrustedSequencer
```solidity
  event SetTrustedSequencer(
  )
```

Emitted when a trusted sequencer update his address.

### SetForceBatchAllowed
```solidity
  event SetForceBatchAllowed(
  )
```

Emitted when a trusted sequencer update the forcebatch boolean.

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when a trusted sequencer update his URL.

