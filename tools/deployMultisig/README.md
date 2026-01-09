# Deploy Safe contracts and create multisig (via Deterministic Deployment Proxy)

This setup is split into **two scripts**:

1) **Safe contracts deploy**: ensures the **Deterministic Deployment Proxy (DDP)** is deployed, and deploys the **Gnosis Safe Singleton** + **Safe Proxy Factory** (if missing).  
2) **Multisig deploy**: creates a **Gnosis Safe multisig** at a predefined expected address (requires the Safe stack to exist first).

Both scripts are designed to be **idempotent**: they check `getCode(address)` and skip steps if already deployed.

---

## What this does

### Script 1 — Deploy Safe stack
On the selected network, the Safe stack script:

1. **Checks DDP** at `0x4e59...956c`
   - If not deployed, it:
     - Funds a **one-time deployer EOA** (the one that already signed the raw tx)
     - Broadcasts the **raw signed deployment transaction**
     - Verifies code exists at the DDP address

2. **Checks Safe Singleton** at `0xd9db...9552`
   - If missing, deploys it **via DDP** using precomputed calldata
   - Verifies code exists at the singleton address

3. **Checks Safe Proxy Factory** at `0xa6B7...6AB2`
   - If missing, deploys it **via DDP** using precomputed calldata
   - Verifies code exists at the proxy factory address

4. Writes a JSON file with `hashes/addresses/network` to:
   - `deploy_output_<DATE>.json` (in the same folder as the script)

### Script 2 — Deploy multisig

If you want the predefined Safe multisig, run the second script **after** the Safe contracts are deployed.

The multisig script:

1. **Sanity-checks** if code already exists at the expected Safe address

2. If not, calls the **Safe Proxy Factory** to create the Safe (using precomputed calldata)

3. Verifies the Safe is created at the expected address

4. Writes a JSON file with `hashes/addresses/network`
   - `multisig_output_<DATE>.json` (in the same folder as the script)
---

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env
```

Fill `.env` with your `INFURA_PROJECT_ID`, `MNEMONIC` or and `DEPLOYER_PRIVATE_KEY`.

3. Configure deployment parameters (optional):

In this case, the `deploy_parameters.json` file is optional (since the script can be executed without any mandatory parameters). If you want to customize the provider / gas / signer behavior, you can create it manually using any of the following optional parameters:

- `"maxFeePerGas": ""` -> Optional: Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
- `"maxPriorityFeePerGas": ""` -> Optional: Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
- `"multiplierGas": ""` -> Optional: Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect

## Constants (addresses)

The script targets fixed addresses:

- DDP: `0x4e59b44847b379578588920ca78fbf26c0b4956c`
- Safe Singleton: `0xd9db270c1b5e3bd161e8c8503c55ceabee709552`
- Safe Proxy Factory: `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`
- Expected Safe (multisig): `0x242daE44F5d8fb54B198D03a94dA45B5a4413e21`

One-time deployer used only for DDP raw tx funding: `0x3fab184622dc19b6109349b94811493bf2a45362`

## Usage

### 1. Deploy Safe contracts

```
npx hardhat run tools/deployMultisig/deploySafe.ts --network <network>
```

Example:

```
npx hardhat run tools/deployMultisig/deploySafe.ts --network sepolia
```

### 2. Deploy multisig Safe (requires step 1)

```
npx hardhat run ./tools/deployMultisig/deployMultisig.ts --network <network>
```

Example:

```
npx hardhat run ./tools/deployMultisig/deployMultisig.ts --network sepolia
```

If the Safe already exists at the expected address, the multisig script will log that and exit without redeploying.

## Multisig configuration

The multisig wallet is created using `Gnosis Safe Proxy Factory` via `createProxyWithNonce`, with the following parameters:

- Type: Gnosis Safe
- Owners (3):
   - `0x4c1665d6651ecEfa59B9B3041951608468b18891`
   - `0xA0B02B28920812324f1cC3255bd8840867d3f227`
   - `0xEad77b01ea770839F7f576Cd1516Ff6A298d9dB2`
- Threshold: 2 signatures required (2-of-3)
- Fallback handler: `0xF48f2B2D2a534E402487b3Ee7C18C33Aec0FE5e4`
- Additional setup call: None (to = address(0), data = "")
- Payment: Disabled (no setup payment)
- Deployment method: `createProxyWithNonce` (`CREATE2`)

This configuration results in a 2-of-3 Gnosis Safe multisig with no additional modules enabled at deployment time.