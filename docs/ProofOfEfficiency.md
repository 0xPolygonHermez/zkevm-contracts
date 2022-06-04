Contract responsible for managing the state and the updates of it of the L2 Hermez network.
There will be sequencer, wich are able to send transactions. That transactions will be stored in the contract.
The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
To enter and exit of the L2 network will be used a Bridge smart contract


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
|`_rollupVerifier` | contract IVerifierRollup | rollup verifier addressv
|`genesisRoot` | bytes32 | rollup genesis root

### forceBatch
```solidity
  function forceBatch(
    bytes transactions,
    uint256 maticAmount
  ) public
```
Allows a sequencer/user to force a batch of L2 transactions,
This tx can be front-runned by the sendBatches tx
This should be used only in extreme cases where the super sequencer does not work as expected


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 with signature:
rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceBatches
```solidity
  function sequenceBatches(
    struct ProofOfEfficiency.Sequence[] sequences
  ) public
```
Allows a sequencer to send a batch of L2 transactions


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`sequences` | struct ProofOfEfficiency.Sequence[] | L2 ethereum transactions EIP-155 with signature:
rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s

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
If not exist the batch, the circuit will not be able to match the hash image of 0


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`numBatch` | uint64 | Batch number that the aggregator intends to verify, used as a sanity check
|`proofA` | uint256[2] | zk-snark input
|`proofB` | uint256[2][2] | zk-snark input
|`proofC` | uint256[2] | zk-snark input

### calculateForceProverFee
```solidity
  function calculateForceProverFee(
  ) public returns (uint256)
```
Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO



## Events
### RegisterSequencer
```solidity
  event RegisterSequencer(
  )
```

Emitted when a sequencer is registered or updated

### SequencedBatches
```solidity
  event SequencedBatches(
  )
```

Emitted when a sequencer sends a new batch of transactions

### ForceBatch
```solidity
  event ForceBatch(
  )
```

Emitted when a batch is forced

### VerifyBatch
```solidity
  event VerifyBatch(
  )
```

Emitted when a aggregator verifies a new batch

