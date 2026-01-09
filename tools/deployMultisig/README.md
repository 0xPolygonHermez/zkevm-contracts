# Deploy Safe stack + create multisig (via Deterministic Deployment Proxy)

Script to (1) ensure the **Deterministic Deployment Proxy (DDP)** is deployed, (2) deploy the **Gnosis Safe Singleton** and **Safe Proxy Factory** (if missing), and (3) **create a Safe multisig** at a predefined expected address.

It is designed to be idempotent: if a component is already deployed, it will skip deployment and continue.

---

## What this does

On the selected network, the script:

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

4. **Creates the multisig Safe**
   - Expected Safe address: `0x242d...3e21`
   - If missing, calls the proxy factory with precomputed calldata to deploy the Safe
   - Verifies code exists at the expected Safe address

5. Writes a JSON file with `hashes/addresses/network` to:
   - `deploy_output_<DATE>.json` (in the same folder as the script)

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

Example:
```
npx hardhat run ./tools/safeDeploy/deploySafeStack.ts --network sepolia
```

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