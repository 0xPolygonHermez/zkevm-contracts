# Foundry Cast

Use `cast` (from Foundry) as the go-to CLI tool for on-chain queries, ABI encoding/decoding, conversions, and contract interaction. Prefer `cast` over writing ad-hoc scripts when a one-liner will do.

## When to use cast

- User asks about on-chain state (balances, storage, owners, roles, nonces)
- User pastes calldata or tx hashes and wants them decoded
- You need to encode calldata for multisig or timelock operations
- Converting between units (wei/ether/gwei), hex/dec, or address checksumming
- Querying block info, gas prices, chain IDs
- Looking up function selectors or event signatures
- Verifying contract bytecode or storage slots

## Common patterns for this repo

### Check if an address is a contract
```bash
# If bytecode is 0x (empty), it's an EOA. If non-empty, it's a contract.
cast code <address> --rpc-url <rpc>
```
Use this whenever the user asks "is there a contract at this address?" or when you need to verify a deployment.

### Encode calldata for Safe multisig `prepareTransaction.ts`

When the user wants to prepare a Safe multisig transaction but describes the action in plain language (e.g., "I want to transfer tokens", "I want to grant a role"), encode the calldata for them using `cast calldata` and write it into `parameters.json`.

```bash
# ERC-20 transfer
cast calldata "transfer(address,uint256)" 0xRecipient 1000000000000000000

# ERC-20 approve
cast calldata "approve(address,uint256)" 0xSpender 1000000000000000000

# Grant role (AccessControl)
cast calldata "grantRole(bytes32,address)" $(cast keccak "PROPOSER_ROLE") 0xAccount

# Revoke role
cast calldata "revokeRole(bytes32,address)" $(cast keccak "EXECUTOR_ROLE") 0xAccount

# Timelock schedule
cast calldata "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" \
  0xTarget 0 0xInnerCalldata 0x0000000000000000000000000000000000000000000000000000000000000000 \
  0xSalt 259200

# Timelock execute
cast calldata "execute(address,uint256,bytes,bytes32,bytes32)" \
  0xTarget 0 0xInnerCalldata 0x0000000000000000000000000000000000000000000000000000000000000000 \
  0xSalt
```

### Decode calldata the user pastes

When the user pastes hex calldata and asks "what is this?", decode it:
```bash
# Try auto-decode from 4byte directory first
cast 4byte-decode <calldata>

# If that fails or user knows the signature
cast calldata-decode "functionName(argTypes)" <calldata>
```

Also useful: extract just the selector to identify the function:
```bash
# First 4 bytes = selector
cast 4byte 0xa9059cbb   # -> "transfer(address,uint256)"
```

### Contract reads (no tx, free)
```bash
# Call a view/pure function
cast call <address> "functionName(argTypes)(returnTypes)" [args] --rpc-url <rpc>

# Examples relevant to this repo:
cast call 0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2 "rollupCount()(uint32)" --rpc-url $RPC
cast call <safe> "getOwners()(address[])" --rpc-url $RPC
cast call <safe> "getThreshold()(uint256)" --rpc-url $RPC
cast call <contract> "owner()(address)" --rpc-url $RPC
cast call <timelock> "getMinDelay()(uint256)" --rpc-url $RPC
cast call <contract> "hasRole(bytes32,address)(bool)" <role> <addr> --rpc-url $RPC
```

### Storage inspection
```bash
# Read raw storage slot
cast storage <address> <slot> --rpc-url <rpc>

# Read storage with layout (needs compiled contract)
cast storage <address> --rpc-url <rpc>
```

### ABI encoding/decoding
```bash
# Encode calldata for a function call
cast calldata "functionName(argTypes)" [args]

# Decode calldata (if selector is known)
cast calldata-decode "functionName(argTypes)(returnTypes)" <calldata>
# Or auto-detect from 4byte directory
cast 4byte-decode <calldata>

# ABI-encode arguments (without selector, for constructors or low-level)
cast abi-encode "functionName(argTypes)" [args]

# ABI-decode return data
cast abi-decode "functionName(argTypes)(returnTypes)" <data>
```

### Function selectors and event topics
```bash
# Get 4-byte selector from signature
cast sig "transfer(address,uint256)"

# Get event topic hash
cast sig-event "Transfer(address,address,uint256)"

# Lookup selector from 4byte directory
cast 4byte 0xa9059cbb
```

### Transaction queries
```bash
# Get transaction details
cast tx <txhash> --rpc-url <rpc>

# Get transaction receipt
cast receipt <txhash> --rpc-url <rpc>

# Decode tx input data
cast pretty-calldata <calldata>
```

### Conversions
```bash
# Wei <-> Ether
cast to-wei 1.5 ether        # -> 1500000000000000000
cast from-wei 1500000000000000000  # -> 1.5

# Hex <-> Decimal
cast to-hex 255               # -> 0xff
cast to-dec 0xff               # -> 255

# Keccak hash (for role identifiers, storage slots, etc.)
cast keccak "TIMELOCK_ADMIN_ROLE"

# Checksum an address
cast to-check-sum-address 0xabcd...

# bytes32 <-> string
cast format-bytes32-string "hello"
cast parse-bytes32-string 0x68656c6c6f...

# Compute padded bytes32 from number
cast to-bytes32 1
```

### Chain info
```bash
cast chain-id --rpc-url <rpc>
cast block-number --rpc-url <rpc>
cast gas-price --rpc-url <rpc>
cast balance <address> --rpc-url <rpc>
cast nonce <address> --rpc-url <rpc>
cast code <address> --rpc-url <rpc>
cast block latest --rpc-url <rpc>
```

### Contract metadata
```bash
# Get contract ABI from Etherscan
cast etherscan-source <address> --etherscan-api-key $ETHERSCAN_API_KEY

# Generate interface from ABI
cast interface <address> --etherscan-api-key $ETHERSCAN_API_KEY
```

### Sending transactions (DANGEROUS -- always confirm with user)
```bash
# Send a transaction (requires private key or ledger)
cast send <to> "functionName(argTypes)" [args] --rpc-url <rpc> --private-key <key>
cast send <to> "functionName(argTypes)" [args] --rpc-url <rpc> --ledger
```

## RPC URLs

When the user doesn't specify an RPC, ask. Common ones for this repo:
- Ethereum mainnet: use INFURA_PROJECT_ID from env or ask
- Sepolia: same via Infura
- Custom L2: whatever CUSTOM_PROVIDER is set to

Use `--rpc-url` explicitly rather than relying on env vars, so the command is self-documenting.

## Role identifiers (common in this repo)

```bash
# Compute role hashes used in AccessControl
cast keccak "TIMELOCK_ADMIN_ROLE"       # TimelockController admin
cast keccak "PROPOSER_ROLE"             # Can schedule timelock ops
cast keccak "EXECUTOR_ROLE"             # Can execute timelock ops
cast keccak "CANCELLER_ROLE"            # Can cancel timelock ops
cast keccak "DEFAULT_ADMIN_ROLE"        # 0x00 (special case)
```

## Safety

- NEVER send transactions without explicit user confirmation
- NEVER use `--private-key` with actual keys in command output -- remind user to use env vars or `--ledger`
- For read-only queries (`cast call`, `cast storage`, `cast balance`, etc.), safe to run freely
- Always double-check the network/RPC before any write operation
