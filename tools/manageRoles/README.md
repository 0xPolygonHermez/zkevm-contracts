# Manage Roles Tool

This tool allows you to grant or revoke multiple roles from accounts through the AgglayerManager contract using timelock batch operations.

## Features

- **Grant or Revoke Roles**: Choose between granting or revoking roles
- **Batch Operations**: Process multiple roles in a single timelock transaction
- **Role Validation**: Validates that only supported roles are used
- **Timelock Integration**: Generates both `scheduleBatch` and `executeBatch` calldata
- **Decoded Output**: Provides human-readable decoded transaction data

## Configuration

Edit `manageRoles.json` with the following structure:

```json
{
    "target": "0xYourAgglayerManagerAddress",
    "timelockDelay": 3600,
    "timelockSalt": "",
    "roles": [
        {
            "action": "grant",
            "roleName": "ADD_ROLLUP_TYPE_ROLE",
            "account": "0xAccountAddress1"
        },
        {
            "action": "revoke",
            "roleName": "UPDATE_ROLLUP_ROLE",
            "account": "0xAccountAddress2"
        }
    ]
}
```

### Parameters

- **target**: Address of the target contract (e.g., AgglayerManager or AgglayerTimelock)
- **timelockDelay**: Delay in seconds before the operation can be executed (after scheduling)
- **timelockSalt**: Optional salt for the timelock operation (leave empty for default)
- **roles**: Array of roles to manage, each containing:
  - **action**: Operation to perform - either `"grant"` or `"revoke"`
  - **roleName**: Name of the role (see supported roles below)
  - **account**: Address that will receive or lose the role

### Supported Roles

- `ADD_ROLLUP_TYPE_ROLE` - Ability to add new rollup types
- `OBSOLETE_ROLLUP_TYPE_ROLE` - Ability to mark rollup types as obsolete
- `CREATE_ROLLUP_ROLE` - Ability to create new rollups
- `ADD_EXISTING_ROLLUP_ROLE` - Ability to add existing rollups
- `UPDATE_ROLLUP_ROLE` - Ability to update rollups
- `TRUSTED_AGGREGATOR_ROLE` - Priority verification role
- `TRUSTED_AGGREGATOR_ROLE_ADMIN` - Manage trusted aggregator
- `TWEAK_PARAMETERS_ROLE` - Ability to tweak parameters
- `SET_FEE_ROLE` - Ability to set batch fees
- `STOP_EMERGENCY_ROLE` - Ability to stop emergency state
- `EMERGENCY_COUNCIL_ROLE` - Ability to activate emergency state
- `EMERGENCY_COUNCIL_ADMIN` - Manage emergency council
- `TIMELOCK_ADMIN_ROLE` - Ability to manage timelock contract
- `PROPOSER_ROLE` - Ability to propose timelock operations
- `EXECUTOR_ROLE` - Ability to execute timelock operations
- `CANCELLER_ROLE` - Ability to cancel timelock operations

## Usage

1. Configure your parameters in `manageRoles.json`
2. Run the script:

```bash
npx hardhat run tools/manageRoles/manageRoles.ts --network <network-name>
```

3. The script will generate an output file: `manageRolesOutput-<timestamp>.json`

## Output

The output file contains:

- **roles**: Array of role operations processed (with action, roleName, roleID, and account)
- **scheduleData**: Calldata for scheduling the batch operation in the timelock
- **executeData**: Calldata for executing the batch operation after the delay
- **decodeScheduleData**: Human-readable decoded data for verification

## Examples

### Grant a Single Role
```json
{
    "target": "0xE2EF6215aDc132Df6913C8DD16487aBF118d1764",
    "timelockDelay": 60,
    "roles": [
        {
            "action": "grant",
            "roleName": "OBSOLETE_ROLLUP_TYPE_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        }
    ]
}
```

### Grant Multiple Roles
```json
{
    "target": "0xE2EF6215aDc132Df6913C8DD16487aBF118d1764",
    "timelockDelay": 3600,
    "roles": [
        {
            "action": "grant",
            "roleName": "ADD_ROLLUP_TYPE_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        },
        {
            "action": "grant",
            "roleName": "UPDATE_ROLLUP_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        },
        {
            "action": "grant",
            "roleName": "TRUSTED_AGGREGATOR_ROLE",
            "account": "0x123456789AbCdEf123456789aBcDeF0123456789"
        }
    ]
}
```

### Revoke Multiple Roles
```json
{
    "target": "0xE2EF6215aDc132Df6913C8DD16487aBF118d1764",
    "timelockDelay": 3600,
    "roles": [
        {
            "action": "revoke",
            "roleName": "CREATE_ROLLUP_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        },
        {
            "action": "revoke",
            "roleName": "TRUSTED_AGGREGATOR_ROLE",
            "account": "0x123456789AbCdEf123456789aBcDeF0123456789"
        }
    ]
}
```

### Mixed Operations (Grant and Revoke in Same Batch)
```json
{
    "target": "0xE2EF6215aDc132Df6913C8DD16487aBF118d1764",
    "timelockDelay": 3600,
    "roles": [
        {
            "action": "grant",
            "roleName": "ADD_ROLLUP_TYPE_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        },
        {
            "action": "revoke",
            "roleName": "CREATE_ROLLUP_ROLE",
            "account": "0x677Cb14eb7349DAAcb5Eb5FEfB2f731F969724Ba"
        },
        {
            "action": "grant",
            "roleName": "TRUSTED_AGGREGATOR_ROLE",
            "account": "0x123456789AbCdEf123456789aBcDeF0123456789"
        }
    ]
}
```

## Workflow

1. **Generate Calldata**: Run this script to generate schedule and execute calldata
2. **Schedule Transaction**: Submit the `scheduleData` to the timelock contract
3. **Wait for Delay**: Wait for the `timelockDelay` period to pass
4. **Execute Transaction**: Submit the `executeData` to the timelock contract
5. **Verification**: Roles are granted to or revoked from the specified accounts

## Notes

- The script uses `scheduleBatch` and `executeBatch` for efficiency when managing multiple roles
- **You can mix grant and revoke operations in the same batch** - each role entry has its own action
- All operations in a batch share the same salt and predecessor
- The timelock delay applies to the entire batch
- Make sure the timelock has the appropriate role (DEFAULT_ADMIN_ROLE) on the target contract
- When revoking roles, ensure the account currently has the role, otherwise the transaction will fail
- When granting roles, ensure the account doesn't already have the role to avoid unnecessary operations

## Action Details

### Grant Action (`"action": "grant"`)
- Calls `grantRole(bytes32 role, address account)` on the target contract
- Grants the specified role to the account
- Requires the caller (timelock) to have admin privileges for that role

### Revoke Action (`"action": "revoke"`)
- Calls `revokeRole(bytes32 role, address account)` on the target contract
- Removes the specified role from the account
- Requires the caller (timelock) to have admin privileges for that role
