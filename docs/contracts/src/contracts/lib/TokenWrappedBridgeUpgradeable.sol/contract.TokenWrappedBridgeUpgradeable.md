# TokenWrappedBridgeUpgradeable
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/lib/TokenWrappedBridgeUpgradeable.sol)

**Inherits:**
Initializable, ERC20PermitUpgradeable, [ITokenWrappedBridgeUpgradeable](/contracts/interfaces/ITokenWrappedBridgeUpgradeable.sol/interface.ITokenWrappedBridgeUpgradeable.md)


## State Variables
### TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE
The storage slot at which Custom Token storage starts, following the EIP-7201 standard.

Calculated as `keccak256(abi.encode(uint256(keccak256("agglayer.storage.TokenWrappedBridgeUpgradeable")) - 1)) & ~bytes32(uint256(0xff))`.


```solidity
bytes32 private constant TOKEN_WRAPPED_BRIDGE_UPGRADEABLE_STORAGE =
    hex"863b064fe9383d75d38f584f64f1aaba4520e9ebc98515fa15bdeae8c4274d00"
```


## Functions
### onlyBridge


```solidity
modifier onlyBridge() ;
```

### constructor

Disable initializers on the implementation following the best practices.


```solidity
constructor() ;
```

### initialize


```solidity
function initialize(string memory name, string memory symbol, uint8 __decimals) external initializer;
```

### mint

Mints Custom Tokens to the recipient.

This function is only callable by the bridge.


```solidity
function mint(address to, uint256 value) external onlyBridge;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`to`|`address`|The address of the recipient.|
|`value`|`uint256`|The amount of tokens to mint.|


### burn

Notice that is not require to approve wrapped tokens to use the bridge

burns Custom Tokens from the account.

This function is only callable by the bridge.


```solidity
function burn(address account, uint256 value) external onlyBridge;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|The address of the account.|
|`value`|`uint256`|The amount of tokens to burn.|


### nonces


```solidity
function nonces(address owner) public view override(ERC20PermitUpgradeable, IERC20Permit) returns (uint256);
```

### decimals

The number of decimals of the token.


```solidity
function decimals() public view override(ERC20Upgradeable, IERC20Metadata) returns (uint8);
```

### bridgeAddress

The address of the bridge contract.


```solidity
function bridgeAddress() public view returns (address);
```

### _getTokenWrappedBridgeUpgradeableStorage

A function to return a pointer for the TokenWrappedBridgeUpgradeableStorageLocation.


```solidity
function _getTokenWrappedBridgeUpgradeableStorage()
    internal
    pure
    returns (TokenWrappedBridgeUpgradeableStorage storage $);
```

## Errors
### OnlyBridge

```solidity
error OnlyBridge();
```

## Structs
### TokenWrappedBridgeUpgradeableStorage
Storage of TokenWrappedBridgeUpgradeable contract.

It's implemented on a custom ERC-7201 namespace to reduce the risk of storage collisions when using with upgradeable contracts.

**Note:**
storage-location: erc7201:agglayer.storage.TokenWrappedBridgeUpgradeable


```solidity
struct TokenWrappedBridgeUpgradeableStorage {
    uint8 decimals;
    address bridgeAddress;
}
```

