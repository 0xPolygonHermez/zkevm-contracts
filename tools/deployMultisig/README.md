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

The script uses fixed addresses for the Safe infrastructure:

- DDP: `0x4e59b44847b379578588920ca78fbf26c0b4956c`
- Safe Singleton: `0xd9db270c1b5e3bd161e8c8503c55ceabee709552`
- Safe Proxy Factory: `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`
- Fallback Handler: `0xF48f2B2D2a534E402487b3Ee7C18C33Aec0FE5e4`
- Safe (multisig): **Determined from deployment** - address is extracted from the `ProxyCreation` event emitted during deployment

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

```bash
SAFE_OWNERS=<comma-separated-addresses> SAFE_THRESHOLD=<number> [SALT_NONCE=<number>] npx hardhat run ./tools/deployMultisig/deployMultisig.ts --network <network>
```

**Required environment variables:**
- `SAFE_OWNERS`: Comma-separated list of owner addresses (e.g., `0xAddr1,0xAddr2,0xAddr3`)
- `SAFE_THRESHOLD`: Number of signatures required for transactions (must be between 1 and the number of owners)

**Optional environment variables:**
- `SALT_NONCE`: A unique number for CREATE2 deployment. If not provided, the current timestamp will be used. Using the same salt nonce with the same parameters will result in the same Safe address.

Example (2-of-3 multisig):

```bash
SAFE_OWNERS=0x4c1665d6651ecEfa59B9B3041951608468b18891,0xA0B02B28920812324f1cC3255bd8840867d3f227,0xEad77b01ea770839F7f576Cd1516Ff6A298d9dB2 SAFE_THRESHOLD=2 SALT_NONCE=1678956703240 npx hardhat run ./tools/deployMultisig/deployMultisig.ts --network sepolia
```

Example (3-of-5 multisig):

```bash
SAFE_OWNERS=0xAddr1,0xAddr2,0xAddr3,0xAddr4,0xAddr5 SAFE_THRESHOLD=3 SALT_NONCE=1678956703240 npx hardhat run ./tools/deployMultisig/deployMultisig.ts --network mainnet
```

## Multisig configuration

The multisig wallet is created using `Gnosis Safe Proxy Factory` via `createProxyWithNonce`, with the following parameters:

- Type: Gnosis Safe
- Owners: Provided via `SAFE_OWNERS` environment variable
- Threshold: Provided via `SAFE_THRESHOLD` environment variable
- Salt Nonce: Provided via `SALT_NONCE` environment variable (optional, defaults to current timestamp)
- Fallback handler: `0xF48f2B2D2a534E402487b3Ee7C18C33Aec0FE5e4`
- Additional setup call: None (to = address(0), data = "")
- Payment: Disabled (no setup payment)
- Deployment method: `createProxyWithNonce` (`CREATE2`)

The script will:
1. Validate all owner addresses
2. Validate the threshold is between 1 and the number of owners
3. Use provided salt nonce or generate one from current timestamp
4. Dynamically encode the Safe setup and deployment calldata
5. Deploy the Safe via the Proxy Factory using CREATE2
6. Extract the deployed Safe address from the transaction logs
7. Verify the Safe contract code exists at the deployed address
8. Save deployment info including Safe address, owners, threshold, and salt nonce to `multisig_output_<DATE>.json`