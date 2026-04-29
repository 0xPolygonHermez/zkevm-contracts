# AggLayer DVN — Contract Overview

This directory contains the Solidity contracts for the AggLayer DVN PoC, which
integrates the AggLayer bridge as a Decentralised Verifier Network (DVN) on the
LayerZero v2 protocol.

## Contract Roles

### `AggLayerDVN.sol`
Source-chain DVN that implements `ILayerZeroDVN`.  LayerZero calls
`assignJob` when a packet needs verification.  The contract charges a flat fee,
emits a `JobAssigned` event consumed by the off-chain worker, and accumulates
fees until the owner calls `withdrawFees`.

### `AggLayerDVNCoordinator.sol`
Destination-chain coordinator (also registered as the DVN in UlnConfig).  An
allowlisted off-chain worker calls `claimAndVerify`, which in a single
transaction:
1. Validates the packet header and `payloadHash`.
2. Calls `claimAndReserve` on the OFT receiver to execute the AggLayer bridge
   claim and reserve the LayerZero delivery slot.
3. Falls through to `reserveAfterClaim` if the bridge claim was already
   processed (front-run path).
4. Calls `IReceiveUlnE2.verify` so LayerZero accepts the packet.

### `AgglayerOFTAdapter.sol`
Source-chain OFT adapter (wraps an existing ERC-20 on Ethereum).  Extends
LayerZero `OFTAdapter` with an AggLayer bridge route: when the destination is
configured as an AGL-route, `_send` locks the token in the bridge instead of
the standard OFT path.  Implements `IAggLayerOFTReceiver` so the coordinator
can call `claimAndReserve` / `reserveAfterClaim` on the return leg.  All new
state is stored in an ERC-7201 namespaced storage slot
(`agglayer.dvn.OFTAdapterStorage`) to avoid collisions with parent contract
storage.

### `AgglayerOFT.sol`
Destination-chain OFT (mints/burns on Polygon).  Mirrors `AgglayerOFTAdapter`
on the other side: AGL-route sends burn the token and call the bridge, while
`lzReceive` only mints after the coordinator has placed a valid reservation.
State lives in `agglayer.dvn.OFTStorage` (ERC-7201).

### `AggLayerOFTPayloadV1.sol` (codec)
Defines the `AggLayerOFTPayloadV1` struct and `AggLayerOFTPayloadCodec`
library.  The wire format is a flat four-field ABI encoding (no outer offset
word):

```
abi.encode(bytes4 magic, uint16 version, bytes oftMessage, uint256 globalIndex)
```

Magic bytes are `"ALO1"` (0x414c4f31), version is `1`.  The flat encoding
(individual fields, not a struct) is required to match the Go codec's
`abi.Arguments.Pack` layout.

### `LzRoutePolicy.sol`
Pure data struct that binds an AggLayer bridge route to a LayerZero route.
Fields: `sourceBridgeNetwork`, `destinationBridgeNetwork`, `peerSrcEid`,
`peerDstEid`, `srcOFT`, `dstOFTReceiver`, `tokenSrc`, `tokenDst`.

### Interfaces
| File | Purpose |
|---|---|
| `ILayerZeroDVN.sol` | LayerZero DVN interface (`assignJob`, `getFee`) |
| `IReceiveUlnE2.sol` | LayerZero ULN receive library interface (`verify`) |
| `IAggLayerOFTReceiver.sol` | Receiver interface (`claimAndReserve`, `reserveAfterClaim`) |
| `IAggLayerDVNCoordinator.sol` | Coordinator interface (`claimAndVerify`) |

---

## Deployment Order

Deploy in this order so each contract can reference already-deployed addresses:

1. **`AggLayerDVN`** on the source chain (Ethereum).  Constructor args:
   `initialOwner`.
2. **`AggLayerDVNCoordinator`** on the destination chain (Polygon).  Constructor
   args: `initialOwner`, `receiveLib` (ReceiveUln302 address on Polygon),
   `aggLayerOFTReceiver` (address of the OFT contract deployed in step 4 — use
   a pre-computed CREATE2 address or update after step 4).
3. **`AgglayerOFTAdapter`** on the source chain (Ethereum).  Constructor args:
   `token`, `lzEndpoint`, `owner`, `aggLayerBridge`.
4. **`AgglayerOFT`** on the destination chain (Polygon).  Constructor args:
   `name`, `symbol`, `lzEndpoint`, `owner`, `aggLayerBridge`.

---

## Route Configuration Sequence

After deployment, perform the following configuration steps (owner or authorised
caller for each):

1. **Set route on OFT / OFTAdapter** (source and destination chains):
   ```
   AgglayerOFTAdapter.setLzRoutePolicy(srcEid, dstEid, LzRoutePolicy{...})
   AgglayerOFT.setLzRoutePolicy(srcEid, dstEid, LzRoutePolicy{...})
   ```

2. **Register the DVN in LayerZero UlnConfig** for the OFT's send library on
   the source chain and for the OFT's receive library (ReceiveUln302) on the
   destination chain.  The DVN address to register is `AggLayerDVNCoordinator`
   (it is `AggLayerDVNCoordinator` that calls `IReceiveUlnE2.verify`, so it
   must appear as the DVN in the destination ULN config).

3. **Set coordinator on OFTAdapter and OFT**:
   ```
   AgglayerOFTAdapter.setCoordinator(coordinatorAddr)
   AgglayerOFT.setCoordinator(coordinatorAddr)
   ```
   Only the coordinator is allowed to call `claimAndReserve` /
   `reserveAfterClaim`.

4. **Allowlist the off-chain worker on `AggLayerDVN`** (source chain):
   ```
   AggLayerDVN.addSender(workerOrOFTAdapterAddress)
   ```
   (The OFTAdapter address is the `sender` field LayerZero passes to
   `assignJob`.)

5. **Allowlist the off-chain worker on `AggLayerDVNCoordinator`** (destination
   chain):
   ```
   AggLayerDVNCoordinator.addWorker(workerAddress)
   ```

---

## AggLayerOFTPayloadV1 Wire Format

The LayerZero OFT `message` field is replaced with an `AggLayerOFTPayloadV1`
blob when the AGL bridge route is active.  It is produced by
`AggLayerOFTPayloadCodec.encode` and consumed by `decode` on the destination
side:

```
offset  size  field
------  ----  -----
0       32    magic (bytes4 "ALO1", right-padded to 32)
32      32    version (uint16 = 1, right-padded to 32)
64      32    oftMessage offset pointer (dynamic)
96      32    globalIndex (uint256)
128     32    oftMessage length
160+    n     oftMessage data (padded to 32-byte boundary)
```

The encoding uses `abi.encode(bytes4, uint16, bytes, uint256)` — four
individual arguments, not a tuple/struct — so there is no outer offset word.
This matches Go's `abi.Arguments.Pack` layout used in the off-chain DVN worker.
