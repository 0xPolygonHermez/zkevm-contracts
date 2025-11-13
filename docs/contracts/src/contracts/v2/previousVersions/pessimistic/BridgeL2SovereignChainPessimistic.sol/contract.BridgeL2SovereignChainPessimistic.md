# BridgeL2SovereignChainPessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/previousVersions/pessimistic/BridgeL2SovereignChainPessimistic.sol)

**Inherits:**
[PolygonZkEVMBridgeV2Pessimistic](/contracts/v2/previousVersions/pessimistic/PolygonZkEVMBridgeV2Pessimistic.sol/contract.PolygonZkEVMBridgeV2Pessimistic.md), [IBridgeL2SovereignChainsPessimistic](/contracts/v2/previousVersions/pessimistic/IBridgeL2SovereignChainsPessimistic.sol/interface.IBridgeL2SovereignChainsPessimistic.md)

Sovereign chains bridge that will be deployed on all Sovereign chains
Contract responsible to manage the token interactions with other networks
This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks


## State Variables
### wrappedAddressIsNotMintable

```solidity
mapping(address wrappedAddress => bool isNotMintable) public wrappedAddressIsNotMintable;
```


### bridgeManager

```solidity
address public bridgeManager;
```


## Functions
### constructor

Disable initializers on the implementation following the best practices


```solidity
constructor();
```

### initialize

The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge, intentionally


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata,
    address _bridgeManager,
    address _sovereignWETHAddress,
    bool _sovereignWETHAddressIsNotMintable
) public virtual initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_gasTokenAddress`|`address`|gas token address|
|`_gasTokenNetwork`|`uint32`|gas token network|
|`_globalExitRootManager`|`IBasePolygonZkEVMGlobalExitRoot`|global exit root manager address|
|`_polygonRollupManager`|`address`|Rollup manager address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|
|`_bridgeManager`|`address`|bridge manager address|
|`_sovereignWETHAddress`|`address`|sovereign WETH address|
|`_sovereignWETHAddressIsNotMintable`|`bool`|Flag to indicate if the wrapped ETH is not mintable|


### initialize

Override the function to prevent the contract from being initialized with this initializer


```solidity
function initialize(uint32, address, uint32, IBasePolygonZkEVMGlobalExitRoot, address, bytes memory)
    external
    override(IPolygonZkEVMBridgeV2Pessimistic, PolygonZkEVMBridgeV2Pessimistic)
    initializer;
```

### onlyBridgeManager


```solidity
modifier onlyBridgeManager();
```

### setMultipleSovereignTokenAddress

Remap multiple wrapped tokens to a new sovereign token address

*This function is a "multi/batch call" to `setSovereignTokenAddress`*


```solidity
function setMultipleSovereignTokenAddress(
    uint32[] memory originNetworks,
    address[] memory originTokenAddresses,
    address[] memory sovereignTokenAddresses,
    bool[] memory isNotMintable
) external onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetworks`|`uint32[]`|Array of Origin networks|
|`originTokenAddresses`|`address[]`|Array od Origin token addresses, 0 address is reserved for ether|
|`sovereignTokenAddresses`|`address[]`|Array of Addresses of the sovereign wrapped token|
|`isNotMintable`|`bool[]`|Array of Flags to indicate if the wrapped token is not mintable|


### _setSovereignTokenAddress

Remap a wrapped token to a new sovereign token address

If this function is called multiple times for the same existingTokenAddress,
this will override the previous calls and only keep the last sovereignTokenAddress.

The tokenInfoToWrappedToken mapping  value is replaced by the new sovereign address but it's not the case for the wrappedTokenToTokenInfo map where the value is added, this way user will always be able to withdraw their tokens

The number of decimals between sovereign token and origin token is not checked, it doesn't affect the bridge functionality but the UI.

*This function is used to allow any existing token to be mapped with
origin token.*


```solidity
function _setSovereignTokenAddress(
    uint32 originNetwork,
    address originTokenAddress,
    address sovereignTokenAddress,
    bool isNotMintable
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`sovereignTokenAddress`|`address`|Address of the sovereign wrapped token|
|`isNotMintable`|`bool`|Flag to indicate if the wrapped token is not mintable|


### removeLegacySovereignTokenAddress

Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens

It also removes the token from the isNotMintable mapping

Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping


```solidity
function removeLegacySovereignTokenAddress(address legacySovereignTokenAddress) external onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`legacySovereignTokenAddress`|`address`|Address of the sovereign wrapped token|


### setSovereignWETHAddress

Set the custom wrapper for weth

If this function is called multiple times this will override the previous calls and only keep the last WETHToken.

WETH will not maintain legacy versions.Users easily should be able to unwrapp the legacy WETH and unwrapp it with the new one.


```solidity
function setSovereignWETHAddress(address sovereignWETHTokenAddress, bool isNotMintable) external onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sovereignWETHTokenAddress`|`address`|Address of the sovereign weth token|
|`isNotMintable`|`bool`|Flag to indicate if the wrapped token is not mintable|


### migrateLegacyToken

Moves old native or remapped token (legacy) to the new mapped token. If the token is mintable, it will be burnt and minted, otherwise it will be transferred


```solidity
function migrateLegacyToken(address legacyTokenAddress, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`legacyTokenAddress`|`address`|Address of legacy token to migrate|
|`amount`|`uint256`|Legacy token balance to migrate|


### unsetMultipleClaimedBitmap

unset multiple claims from the claimedBitmap

*This function is a "multi/batch call" to `unsetClaimedBitmap`*


```solidity
function unsetMultipleClaimedBitmap(uint32[] memory leafIndexes, uint32[] memory sourceBridgeNetworks)
    external
    onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndexes`|`uint32[]`|Array of Index|
|`sourceBridgeNetworks`|`uint32[]`|Array of Origin networks|


### setBridgeManager

Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase


```solidity
function setBridgeManager(address _bridgeManager) external onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeManager`|`address`|Bridge manager address|


### _bridgeWrappedAsset

Burn tokens from wrapped token to execute the bridge, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like Bridge2SovereignChain


```solidity
function _bridgeWrappedAsset(TokenWrapped tokenWrapped, uint256 amount) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`TokenWrapped`|Wrapped token to burnt|
|`amount`|`uint256`|Amount of tokens|


### _claimWrappedAsset

Mints tokens from wrapped token to proceed with the claim, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like BridgeL2SovereignChain


```solidity
function _claimWrappedAsset(TokenWrapped tokenWrapped, address destinationAddress, uint256 amount) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`TokenWrapped`|Wrapped token to mint|
|`destinationAddress`|`address`|Minted token receiver|
|`amount`|`uint256`|Amount of tokens|


### _unsetClaimedBitmap


```solidity
function _unsetClaimedBitmap(uint32 leafIndex, uint32 sourceBridgeNetwork) private;
```

### isClaimed

Function to check if an index is claimed or not

*function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context*


```solidity
function isClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) external view override returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### _setAndCheckClaimed

Function to check that an index is not claimed and set it as claimed

*function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context*


```solidity
function _setAndCheckClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### _permit

Function to call token permit method of extended ERC20

*function overridden from PolygonZkEVMBridgeV2 to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context
+ @param token ERC20 token address*


```solidity
function _permit(address token, uint256 amount, bytes calldata permitData) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`||
|`amount`|`uint256`|Quantity that is expected to be allowed|
|`permitData`|`bytes`|Raw data of the call `permit` of the token|


### activateEmergencyState


```solidity
function activateEmergencyState()
    external
    pure
    override(IPolygonZkEVMBridgeV2Pessimistic, PolygonZkEVMBridgeV2Pessimistic);
```

### deactivateEmergencyState


```solidity
function deactivateEmergencyState()
    external
    pure
    override(IPolygonZkEVMBridgeV2Pessimistic, PolygonZkEVMBridgeV2Pessimistic);
```

## Events
### SetBridgeManager
*Emitted when a bridge manager is updated*


```solidity
event SetBridgeManager(address bridgeManager);
```

### UnsetClaim
*Emitted when a claim is unset*


```solidity
event UnsetClaim(uint32 leafIndex, uint32 sourceBridgeNetwork);
```

### SetSovereignTokenAddress
*Emitted when a token address is remapped by a sovereign token address*


```solidity
event SetSovereignTokenAddress(
    uint32 originNetwork, address originTokenAddress, address sovereignTokenAddress, bool isNotMintable
);
```

### MigrateLegacyToken
*Emitted when a legacy token is migrated to a new token*


```solidity
event MigrateLegacyToken(address sender, address legacyTokenAddress, address updatedTokenAddress, uint256 amount);
```

### RemoveLegacySovereignTokenAddress
*Emitted when a remapped token is removed from mapping*


```solidity
event RemoveLegacySovereignTokenAddress(address sovereignTokenAddress);
```

### SetSovereignWETHAddress
*Emitted when a WETH address is remapped by a sovereign WETH address*


```solidity
event SetSovereignWETHAddress(address sovereignWETHTokenAddress, bool isNotMintable);
```

