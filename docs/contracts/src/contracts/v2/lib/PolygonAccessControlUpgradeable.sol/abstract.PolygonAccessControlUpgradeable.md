# PolygonAccessControlUpgradeable
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/PolygonAccessControlUpgradeable.sol)

**Inherits:**
Initializable, ContextUpgradeable, IAccessControlUpgradeable

*Contract AccessControlUpgradeable from Openzeppelin with the following modifications:
- Delete ERC165Upgradeable dependencies, which is not important to our contract and save us the "gap"
variables and let us have consistent storage
- Add the legacy Owner variable, to be consistent with the previous one
- Add custom errors
- Replace _msgSender() with msg.sender*


## State Variables
### _legacyOwner
**Note:**
oz-renamed-from: _owner


```solidity
address internal _legacyOwner;
```


### _roles

```solidity
mapping(bytes32 => RoleData) private _roles;
```


### DEFAULT_ADMIN_ROLE

```solidity
bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
```


### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.
See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps*


```solidity
uint256[48] private __gap;
```


## Functions
### __AccessControl_init


```solidity
function __AccessControl_init() internal onlyInitializing;
```

### onlyRole

*Modifier that checks that an account has a specific role. Reverts
with a standardized message including the required role.
The format of the revert reason is given by the following regular expression:
/^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
_Available since v4.1._*


```solidity
modifier onlyRole(bytes32 role);
```

### hasRole

*Returns `true` if `account` has been granted `role`.*


```solidity
function hasRole(bytes32 role, address account) public view virtual override returns (bool);
```

### _checkRole

*Revert with a standard message if `msg.sender` is missing `role`.
Overriding this function changes the behavior of the [onlyRole](/contracts/v2/lib/PolygonAccessControlUpgradeable.sol/abstract.PolygonAccessControlUpgradeable.md#onlyrole) modifier.
Format of the revert message is described in {_checkRole}.
_Available since v4.6._*


```solidity
function _checkRole(bytes32 role) internal view virtual;
```

### _checkRole

*Revert with a standard message if `account` is missing `role`.
The format of the revert reason is given by the following regular expression:
/^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/*


```solidity
function _checkRole(bytes32 role, address account) internal view virtual;
```

### getRoleAdmin

*Returns the admin role that controls `role`. See [grantRole](/contracts/v2/lib/PolygonAccessControlUpgradeable.sol/abstract.PolygonAccessControlUpgradeable.md#grantrole) and
{revokeRole}.
To change a role's admin, use {_setRoleAdmin}.*


```solidity
function getRoleAdmin(bytes32 role) public view virtual override returns (bytes32);
```

### grantRole

*Grants `role` to `account`.
If `account` had not been already granted `role`, emits a {RoleGranted}
event.
Requirements:
- the caller must have ``role``'s admin role.
May emit a {RoleGranted} event.*


```solidity
function grantRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role));
```

### revokeRole

*Revokes `role` from `account`.
If `account` had been granted `role`, emits a {RoleRevoked} event.
Requirements:
- the caller must have ``role``'s admin role.
May emit a {RoleRevoked} event.*


```solidity
function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role));
```

### renounceRole

*Revokes `role` from the calling account.
Roles are often managed via [grantRole](/contracts/v2/lib/PolygonAccessControlUpgradeable.sol/abstract.PolygonAccessControlUpgradeable.md#grantrole) and {revokeRole}: this function's
purpose is to provide a mechanism for accounts to lose their privileges
if they are compromised (such as when a trusted device is misplaced).
If the calling account had been revoked `role`, emits a {RoleRevoked}
event.
Requirements:
- the caller must be `account`.
May emit a {RoleRevoked} event.*


```solidity
function renounceRole(bytes32 role, address account) public virtual override;
```

### _setupRole

*Grants `role` to `account`.
If `account` had not been already granted `role`, emits a {RoleGranted}
event. Note that unlike {grantRole}, this function doesn't perform any
checks on the calling account.
May emit a {RoleGranted} event.
[WARNING]
====
This function should only be called from the constructor when setting
up the initial roles for the system.
Using this function in any other way is effectively circumventing the admin
system imposed by {AccessControl}.
====
NOTE: This function is deprecated in favor of {_grantRole}.*


```solidity
function _setupRole(bytes32 role, address account) internal virtual;
```

### _setRoleAdmin

*Sets `adminRole` as ``role``'s admin role.
Emits a {RoleAdminChanged} event.*


```solidity
function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual;
```

### _grantRole

*Grants `role` to `account`.
Internal function without access restriction.
May emit a {RoleGranted} event.*


```solidity
function _grantRole(bytes32 role, address account) internal virtual;
```

### _revokeRole

*Revokes `role` from `account`.
Internal function without access restriction.
May emit a {RoleRevoked} event.*


```solidity
function _revokeRole(bytes32 role, address account) internal virtual;
```

## Errors
### AddressDoNotHaveRequiredRole
*Thrown when the addres does not have the required role*


```solidity
error AddressDoNotHaveRequiredRole();
```

### AccessControlOnlyCanRenounceRolesForSelf
*Thrown when the renounce address is not the message sender*


```solidity
error AccessControlOnlyCanRenounceRolesForSelf();
```

## Structs
### RoleData

```solidity
struct RoleData {
    mapping(address => bool) members;
    bytes32 adminRole;
}
```

