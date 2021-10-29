# PoE (& Rollup)

## Glossary

- PoE --> Proof-of-Efficiency model, consensus mechanism
- bridge L1 --> contract on ethereum mainnet that handles asset transfers between rollups
- bridge L2 --> channel to communicate with mainnet deployed on the rollup which controls minting/burning assets

## Specification

This protocol separates batch creation into two steps. Therefore, we find two parts:

- **Sequencers**: collect L2 transactions from users. They select and create L2 batch in the network (sending ethereum transaction (encoded as RLP) with data of all selected L2 txs)
  - collect L2 txs and propose batches
  - pay MATIC to SC to propose a new batch (proportional to the number of transactions)
  - only propose transactions (no propose states)
  - 1 sequencer / 1 chainID

> The sequencer needs to register to get a chainID (Users needs to chose a chainID to sign. That chainID could be sequencer specific or global. Meaning global that any sequencer could send that transactions and it will be valid)

- **Aggregators**: create validity proof of a new state of the L2 (for one or multiple batches)
  - they have specialized hardware to create ZKP
  - the first aggregator that sends a valid proof wins the race and get rewarded (MATIC sent by the sequencer)
  - the zkp must contain the ethereum address of the agregator
  - invalid transactions are skipped like actual L1 txs
    - The transactions will be processed, but if it is not valid it will have no effect on the state

Then, the two steps are done one for each part:

- `sendBatch`: the **sequencer** sends a group of L2 transactions
- `validateBatch`: the **aggregator** validates de batch

![](https://i.imgur.com/dzDt6Zd.png)

There are two state types:

- Virtual state: state calculated from all pending transactions
- Confirmed state: state confirmed by zpk

## General Flow

### L1 transactions (deposit to RollupX)

![](https://i.imgur.com/bY89lMN.png)

3 Smart contracts:

- Bridge SC (L1)
- Bridge SC (L2)
- PoE SC / Rollup (L1)

The flow when a deposit to RollupA is made, is the following:

- Deposit to RollupA (Bridge L1) is made
- The globalExitTree is updated (Bridge L1) : a leaf is created with de deposit balance
- When a batch is forged in RollupA, the stateRoot and exitRoot are updated
- Then, newExitRoot is sent to Bridge L1 and updated globalExitTree is received (RollupA)
- When a batch is forged, in Bridge L2 contracts it is also updated de globalExitTree.
- When the next batch has been forged, the deposit will be available for the user to claim.
- The user claims deposit and then, Bridge L2 contract must be updated (deposit nullifier)

## Smart contract(s)

### Actions

- registerSequencer
- sendBatch
- validateBatch

#### registerSequencer

- staking --> maybe in the future (MATIC)
- mapping[ethAddr => struct] --> struct = { URL, chainID }

```
registerSequencer(address, URL) {
    mappingSeq[address] = { URL, chainID }
}
```

#### sendBatch

- params: calldata txs bytes (RLP encoded) --> `[]bytes`
  `from (ethAddr), to (ethAddr), amount, fee, signature`
- State updates --> `mapping[numBatch] => struct = { H(txs), chainId/ethAddr}`
  - input in the verify proof
- `sequencerCollateral` in MATIC
  - pay MATIC aggregator

```
sendBatch([]bytes l2TxsData){
    l2TxsDataHash = H(l2TxsData)
    mapping[lastConfirmedBatch + 1] = { H(l2TxsDataHash),  mappingSeq[msg.sender].chainID }
    // sequencerCollateral
}
```

> invalid L2 tx are selected as NOP

#### validateBatch

- params: `newLocalExitRoot`, `newStateRoot`, `batchNum` (sanity check), `proofA`, `proofB`, `proofC`
- input:
  - `globalExitRoot`: global exit root
  - `oldLocalExitRoot`: old local (rollup) exit root
  - `newLocalExitRoot`: new
  - `oldStateRoot`
  - `newStateRoot`
  - `hash(l2TxsData)`
  - `chainID`: chainID + sequencerID
  - `sequencerAddress`

```
**Buffer bytes notation**
[ 256 bits ] globalExitRoot
[ 256 bits ] oldLocalExitRoot
[ 256 bits ] newLocalExitRoot
[ 256 bits ] oldStateRoot
[ 256 bits ] newStateRoot
[ 256 bits ] hash(l2TxsData)
[ 16 bits  ] chainID (sequencerID)
[ 160 bits ] sequencerAddress
```

- verify proof
- update roots
- Communicate with bridge
  - push newLocalExitRoot
  - get globalExitRoot

```
validateBatch(newLocalExitRoot, newStateRoot, batchNum, proofA, proofB, proofC) {
    require(batchNum == lastConfirmedBatch + 1)
    require(verifyProof)
    lastConfirmedBatch++
    stateRootMap[lastConfirmedBatch] = newStateRoot
    exitRootMap[lastConfirmedBatch] = newLocalExitRoot
    bridge.submitLocalExitRoot(newLocalExitRoot)
    lastGlobalExitRoot = bridge.globalExitRoot()
}
```

### Considerations / Simplifications

- sendBatch:
  - pay MATIC aggregator --> 1MATIC/tx (SIMPLIFIED)
- 1.3 bridgeL1:
  - no bridge contract (it only returns true)
  - genesisBlock

### State

- globalExitRoot
- localExitRoot
- stateRoot
- lastConfirmedBatch
- mapping[numBatch] = H(l2txs)
- mapping[ethAddr seq] = URL, chainID

### Sequencer collateral

- Adaptative algoritm to calculate the sequencer collateral
  - Depends on the congestion of the network
    - More tx/block, more collateral is needed for tx
    - Recalculated every batch is aggregated

## Questions after the first draft

When calculating the MATIC fee, how can the contract know hwo many transactions are RPL encoded without decoding them?, could we code at the start some bytes indicating how many transactions will be?
