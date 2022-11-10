Contract responsible for managing the states and the updates of L2 network
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue
THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network
To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks


## Functions
### initialize
```solidity
  function initialize(
    contract IGlobalExitRootManager _globalExitRootManager,
    contract IERC20Upgradeable _matic,
    contract IVerifierRollup _rollupVerifier,
    bytes32 genesisRoot,
    address _trustedSequencer,
    bool _forceBatchAllowed,
    string _trustedSequencerURL,
    uint64 _chainID,
    string _networkName
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address
|`_matic` | contract IERC20Upgradeable | MATIC token address
|`_rollupVerifier` | contract IVerifierRollup | rollup verifier address
|`genesisRoot` | bytes32 | rollup genesis root
|`_trustedSequencer` | address | trusted sequencer address
|`_forceBatchAllowed` | bool | indicates wheather the force batch functionality is available
|`_trustedSequencerURL` | string | trusted sequencer URL
|`_chainID` | uint64 | L2 chainID
|`_networkName` | string | L2 network name

### sequenceBatches
```solidity
  function sequenceBatches(
    struct ProofOfEfficiency.BatchData[] batches
  ) public
```
Allows a sequencer to send multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.BatchData[] | Struct array which the necessary data to append new batces ot the sequence

### verifyBatches
```solidity
  function verifyBatches(
    uint64 _lastVerifiedBatch,
    uint64 newVerifiedBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    uint256[2] proofA,
    uint256[2][2] proofB,
    uint256[2] proofC
  ) public
```
Allows an aggregator to verify a batch


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_lastVerifiedBatch` | uint64 | Last verified Batch
|`newVerifiedBatch` | uint64 | Last batch that the aggregator intends to verify
|`newLocalExitRoot` | bytes32 |  New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
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
This should be used only in extreme cases where the trusted sequencer does not work as expected


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`transactions` | bytes | L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
|`maticAmount` | uint256 | Max amount of MATIC tokens that the sender is willing to pay

### sequenceForceBatches
```solidity
  function sequenceForceBatches(
    struct ProofOfEfficiency.ForceBatchData[] batches
  ) public
```
Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`batches` | struct ProofOfEfficiency.ForceBatchData[] | Struct array which the necessary data to append new batces ot the sequence

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
    bool newForceBatchAllowed
  ) public
```
Allow the current trusted sequencer to allow/disallow the forceBatch functionality


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
Allow the trusted sequencer to set the trusted sequencer URL


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### calculateForceProverFee
```solidity
  function calculateForceProverFee(
  ) public returns (uint256)
```
Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO



### calculateRewardPerBatch
```solidity
  function calculateRewardPerBatch(
  ) public returns (uint256)
```
Function to calculate the reward to verify a single batch



### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
  ) public returns (bytes)
```




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

Emitted when a aggregator verifies a new batch

### SetTrustedSequencer
```solidity
  event SetTrustedSequencer(
  )
```

Emitted when a trusted sequencer update his address

### SetForceBatchAllowed
```solidity
  event SetForceBatchAllowed(
  )
```

Emitted when a trusted sequencer update the forcebatch boolean

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when a trusted sequencer update his URL

