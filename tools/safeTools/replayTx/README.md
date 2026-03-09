# replayTx

Replays a transaction from one network to another. Fetches the original transaction data (to, data, value, gasLimit) from a source network and sends it on the target network using the configured signer.

## Usage

```bash
SOURCE_NETWORK=<source> TX_HASH=<hash> npx hardhat run tools/safeTools/replayTx/replayTx.ts --network <target>
```

| Parameter | Description |
|---|---|
| `SOURCE_NETWORK` | Hardhat network name where the original tx was executed (e.g. `mainnet`, `cardona`) |
| `TX_HASH` | Transaction hash to replay |
| `--network` | Target network where the tx will be replayed |

The signer is determined by `DEPLOYER_PRIVATE_KEY` env var if set, otherwise falls back to the mnemonic in `.env`.

## Example

```bash
SOURCE_NETWORK=mainnet TX_HASH=0xe354ee721ac604f64ad27ddcf2a48dbbb764abdbee6cdd5a8611a3ed8962abce \
  npx hardhat run tools/safeTools/replayTx/replayTx.ts --network cardona
```
