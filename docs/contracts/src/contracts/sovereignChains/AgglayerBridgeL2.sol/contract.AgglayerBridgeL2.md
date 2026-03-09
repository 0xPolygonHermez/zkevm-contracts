# AgglayerBridgeL2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/sovereignChains/AgglayerBridgeL2.sol)

**Inherits:**
[AgglayerBridge](/contracts/AgglayerBridge.sol/contract.AgglayerBridge.md), [IAgglayerBridgeL2](/contracts/interfaces/IAgglayerBridgeL2.sol/interface.IAgglayerBridgeL2.md)

Sovereign chains bridge that will be deployed on all Sovereign chains
Contract responsible to manage the token interactions with other networks
This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks


## State Variables
### deployer
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address private immutable deployer
```


### BRIDGE_SOVEREIGN_VERSION

```solidity
string internal constant BRIDGE_SOVEREIGN_VERSION = "v1.2.0"
```


### wrappedAddressIsNotMintable

```solidity
mapping(address wrappedAddress => bool isNotMintable) public wrappedAddressIsNotMintable
```


### bridgeManager

```solidity
address public bridgeManager
```


### emergencyBridgePauser

```solidity
address public emergencyBridgePauser
```


### claimedGlobalIndexHashChain

```solidity
bytes32 public claimedGlobalIndexHashChain
```


### unsetGlobalIndexHashChain

```solidity
bytes32 public unsetGlobalIndexHashChain
```


### localBalanceTree

```solidity
mapping(bytes32 tokenInfoHash => uint256 amount) public localBalanceTree
```


### _initializerVersionLegacy
Deprecated in favor of _initializerVersion at AgglayerBridge

**Note:**
oz-renamed-from: _initializerVersion


```solidity
uint8 private _initializerVersionLegacy
```


### pendingEmergencyBridgePauser

```solidity
address public pendingEmergencyBridgePauser
```


### emergencyBridgeUnpauser

```solidity
address public emergencyBridgeUnpauser
```


### pendingEmergencyBridgeUnpauser

```solidity
address public pendingEmergencyBridgeUnpauser
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[48] private __gap
```


## Functions
### constructor

Disable initializers on the implementation following the best practices

the deployer is set to the contract creator and will be the only allowed to initialize the contract in a 2 steps process


```solidity
constructor() AgglayerBridge();
```

### initialize

Initialize the AgglayerBridgeL2 contract

The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge in StateTransition chains, intentionally


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBaseLegacyAgglayerGER _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata,
    address _bridgeManager,
    address _sovereignWETHAddress,
    bool _sovereignWETHAddressIsNotMintable,
    address _emergencyBridgePauser,
    address _emergencyBridgeUnpauser,
    address _proxiedTokensManager
) public virtual reinitializer(3);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_gasTokenAddress`|`address`|gas token address|
|`_gasTokenNetwork`|`uint32`|gas token network|
|`_globalExitRootManager`|`IBaseLegacyAgglayerGER`|global exit root manager address|
|`_polygonRollupManager`|`address`|Rollup manager address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|
|`_bridgeManager`|`address`|bridge manager address|
|`_sovereignWETHAddress`|`address`|sovereign WETH address|
|`_sovereignWETHAddressIsNotMintable`|`bool`|Flag to indicate if the wrapped ETH is not mintable|
|`_emergencyBridgePauser`|`address`|emergency bridge pauser address, allowed to be zero if the chain wants to disable the feature to stop the bridge|
|`_emergencyBridgeUnpauser`|`address`|emergency bridge unpauser address, allowed to be zero if the chain wants to disable the feature to unpause the bridge|
|`_proxiedTokensManager`|`address`|address of the proxied tokens manager|


### initialize

Override the function to prevent the contract from being initialized with this initializer


```solidity
function initialize(
    uint32, // _networkID
    address, //_gasTokenAddress
    uint32, //_gasTokenNetwork
    IBaseLegacyAgglayerGER, //_globalExitRootManager
    address, //_polygonRollupManager
    bytes memory //_gasTokenMetadata
)
    external
    override(IAgglayerBridge, AgglayerBridge)
    initializer;
```

### onlyBridgeManager


```solidity
modifier onlyBridgeManager() ;
```

### onlyEmergencyBridgePauser


```solidity
modifier onlyEmergencyBridgePauser() ;
```

### onlyEmergencyBridgeUnpauser


```solidity
modifier onlyEmergencyBridgeUnpauser() ;
```

### onlyGlobalExitRootRemover


```solidity
modifier onlyGlobalExitRootRemover() ;
```

### setMultipleSovereignTokenAddress

Remap multiple wrapped tokens to a new sovereign token address

This function is a "multi/batch call" to `setSovereignTokenAddress`


```solidity
function setMultipleSovereignTokenAddress(
    uint32[] memory originNetworks,
    address[] memory originTokenAddresses,
    address[] memory sovereignTokenAddresses,
    bool[] memory isNotMintable
) external virtual onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetworks`|`uint32[]`|Array of Origin networks|
|`originTokenAddresses`|`address[]`|Origin token address, address of the token at the origin network.|
|`sovereignTokenAddresses`|`address[]`|Array of Addresses of the sovereign wrapped token|
|`isNotMintable`|`bool[]`|Array of Flags to indicate if the wrapped token is not mintable|


### _setSovereignTokenAddress

Remap a wrapped token to a new sovereign token address

If this function is called multiple times for the same existingTokenAddress,
this will override the previous calls and only keep the last sovereignTokenAddress.

The tokenInfoToWrappedToken mapping  value is replaced by the new sovereign address but it's not the case for the wrappedTokenToTokenInfo map where the value is added, this way user will always be able to withdraw their tokens

The number of decimals between sovereign token and origin token is not checked, it doesn't affect the bridge functionality but the UI.

if you set multiple sovereign token addresses for the same pair of originNetwork/originTokenAddress, means you are remapping the same tokenInfoHash
to different sovereignTokenAddress so all those sovereignTokenAddresses will can bridge the mapped tokenInfoHash.

This function is used to allow any existing token to be mapped with
origin token.


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
|`originTokenAddress`|`address`|Origin token address, address of the token at the origin network|
|`sovereignTokenAddress`|`address`|Address of the sovereign wrapped token|
|`isNotMintable`|`bool`|Flag to indicate if the wrapped token is not mintable|


### removeLegacySovereignTokenAddress

Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens

It also removes the token from the isNotMintable mapping

Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping


```solidity
function removeLegacySovereignTokenAddress(address legacySovereignTokenAddress) external virtual onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`legacySovereignTokenAddress`|`address`|Address of the sovereign wrapped token|


### setSovereignWETHAddress

Set the custom wrapper for weth

If this function is called multiple times this will override the previous calls and only keep the last WETHToken.

WETH will not maintain legacy versions.Users easily should be able to unwrap the legacy WETH and unwrapp it with the new one.


```solidity
function setSovereignWETHAddress(address sovereignWETHTokenAddress, bool isNotMintable)
    external
    virtual
    onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sovereignWETHTokenAddress`|`address`|Address of the sovereign weth token|
|`isNotMintable`|`bool`|Flag to indicate if the wrapped token is not mintable|


### _setSovereignWETHAddress


```solidity
function _setSovereignWETHAddress(address sovereignWETHTokenAddress, bool isNotMintable) internal;
```

### migrateLegacyToken

Migrates remapped token (legacy) to the new mapped token. If the token is mintable, it will be burnt and minted, otherwise it will be transferred


```solidity
function migrateLegacyToken(address legacyTokenAddress, uint256 amount, bytes calldata permitData)
    external
    virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`legacyTokenAddress`|`address`|Address of legacy token to migrate|
|`amount`|`uint256`|Legacy token balance to migrate|
|`permitData`|`bytes`||


### unsetMultipleClaims

Unset multiple claims from the claimedBitmap

This function is a "multi/batch call" to `_unsetClaimedBitmap`


```solidity
function unsetMultipleClaims(uint256[] memory globalIndexes) external virtual onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalIndexes`|`uint256[]`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex ||


### setMultipleClaims

Set multiple claims from the claimedBitmap

This function is a "multi/batch call" to `_setAndCheckClaimed`


```solidity
function setMultipleClaims(uint256[] memory globalIndexes) external virtual onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalIndexes`|`uint256[]`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex ||


### backwardLET

Move the LET backward to a previous state with a lower deposit count

Permissioned function by the GlobalExitRootRemover role

Validates that the new tree state is a valid subtree of the current tree

Security Note: The `newFrontier` parameter is technically derivable from `newDepositCount` and `proof`,
but is intentionally required as a dual verification mechanism. This forces callers to demonstrate
complete understanding of the Merkle tree structure and acts as a safeguard against incorrect
proof construction. The redundancy provides security-by-design for this critical emergency function.


```solidity
function backwardLET(
    uint256 newDepositCount,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata newFrontier,
    bytes32 nextLeaf,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata proof
) external virtual onlyGlobalExitRootRemover ifEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newDepositCount`|`uint256`|The new deposit count (must be less than current)|
|`newFrontier`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|The frontier of the subtree at newDepositCount|
|`nextLeaf`|`bytes32`|The leaf that comes immediately after the last leaf of the subset. This is the leaf at position `newDepositCount` in the current tree. For example: if the subset has 5 leaves (positions 0,1,2,3,4), then nextLeaf is the actual leaf stored at position 5 in the current (larger) tree. This leaf must exist in the current tree and serves as proof that the subset is indeed contained within the current tree structure.|
|`proof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Merkle proof showing nextLeaf exists at position newDepositCount in current tree|


### forwardLET

Move the LET forward by adding new leaves in bulk

Permissioned function by the GlobalExitRootRemover role

Adds new leaves incrementally using structured data and validates against expected root as health check


```solidity
function forwardLET(LeafData[] calldata newLeaves, bytes32 expectedLER)
    external
    virtual
    onlyGlobalExitRootRemover
    ifEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLeaves`|`LeafData[]`|Array of leaf data to add to the current tree|
|`expectedLER`|`bytes32`|The expected root after adding all new leaves (health check)|


### forceEmitDetailedClaimEvent

Force emit detailed claim events for already processed claims

This function is useful for replaying historical claims to emit DetailedClaimEvent.
It does not verify the information, call parameters must be checked offchain

Only callable by GlobalExitRootRemover role for security


```solidity
function forceEmitDetailedClaimEvent(ClaimData[] calldata claims) external virtual onlyGlobalExitRootRemover;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`claims`|`ClaimData[]`|Array of claim data to emit events for|


### setLocalBalanceTree

Set local balance tree leaves to specific amounts

Permissioned function by the GlobalExitRootRemover role

The key is generated as keccak256(abi.encodePacked(originNetwork, originTokenAddress))


```solidity
function setLocalBalanceTree(
    uint32[] memory originNetworkArray,
    address[] memory originTokenAddressArray,
    uint256[] memory amountArray
) external virtual onlyGlobalExitRootRemover ifEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetworkArray`|`uint32[]`|The origin network of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree|
|`originTokenAddressArray`|`address[]`|The origin address of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree|
|`amountArray`|`uint256[]`|The amount to set for the local balance tree leaf|


### _setLocalBalanceTree

Set local balance tree leaves to specific amounts

The key is generated as keccak256(abi.encodePacked(originNetwork, originTokenAddress))


```solidity
function _setLocalBalanceTree(uint32 originNetwork, address originTokenAddress, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|The origin network of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree|
|`originTokenAddress`|`address`|The origin address of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree|
|`amount`|`uint256`|The amount to set for the local balance tree leaf|


### deployWrappedTokenAndRemap

Function to deploy an upgradeable wrapped token without having to claim asset. It is used to upgrade legacy tokens to the new upgradeable token. After deploying the token it is remapped to be the new functional wtoken

This function can only be called once for each originNetwork/originTokenAddress pair because it deploys a deterministic contract with create2

WARNING: It's assumed the legacy token has not been remapped.


```solidity
function deployWrappedTokenAndRemap(uint32 originNetwork, address originTokenAddress, bool isNotMintable)
    external
    virtual
    onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network of the token|
|`originTokenAddress`|`address`|Origin token address, address of the token at the origin network.|
|`isNotMintable`|`bool`|Flag to indicate if the proxied wrapped token is not mintable|


### setBridgeManager

Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase


```solidity
function setBridgeManager(address _bridgeManager) external virtual onlyBridgeManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_bridgeManager`|`address`|Bridge manager address|


### transferEmergencyBridgePauserRole

Starts the emergencyBridgePauser role transfer
This is a two step process, the pending emergencyBridgePauser must accepted to finalize the process


```solidity
function transferEmergencyBridgePauserRole(address newEmergencyBridgePauser)
    external
    virtual
    onlyEmergencyBridgePauser;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newEmergencyBridgePauser`|`address`|Address of the new pending emergencyBridgePauser|


### acceptEmergencyBridgePauserRole

Allow the current pending emergencyBridgePauser to accept the emergencyBridgePauser role


```solidity
function acceptEmergencyBridgePauserRole() external virtual;
```

### transferEmergencyBridgeUnpauserRole

Starts the emergencyBridgeUnpauser role transfer
This is a two step process, the pending emergencyBridgeUnpauser must accepted to finalize the process


```solidity
function transferEmergencyBridgeUnpauserRole(address newEmergencyBridgeUnpauser)
    external
    virtual
    onlyEmergencyBridgeUnpauser;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newEmergencyBridgeUnpauser`|`address`|Address of the new pending emergencyBridgeUnpauser|


### acceptEmergencyBridgeUnpauserRole

Allow the current pending emergencyBridgeUnpauser to accept the emergencyBridgeUnpauser role


```solidity
function acceptEmergencyBridgeUnpauserRole() external virtual;
```

### _bridgeWrappedAsset

Burn tokens from wrapped token to execute the bridge, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like Bridge2SovereignChain

in case of tokens with non-standard transfers behavior like fee-on-transfer tokens or Max-value amount transfers user balance tokens,
It is possible that the amount of tokens sent is different from the amount of tokens received, in those cases, the amount that should be
added to the leaf has to be the amount received by the bridge


```solidity
function _bridgeWrappedAsset(ITokenWrappedBridgeUpgradeable tokenWrapped, uint256 amount)
    internal
    override
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`ITokenWrappedBridgeUpgradeable`|Proxied Wrapped token to burnt|
|`amount`|`uint256`|Amount of tokens|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Amount of tokens that must be added to the leaf after the bridge operation|


### _claimWrappedAsset

Mints tokens from wrapped token to proceed with the claim, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like AgglayerBridgeL2


```solidity
function _claimWrappedAsset(ITokenWrappedBridgeUpgradeable tokenWrapped, address destinationAddress, uint256 amount)
    internal
    override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`ITokenWrappedBridgeUpgradeable`|Proxied wrapped token to mint|
|`destinationAddress`|`address`|Minted token receiver|
|`amount`|`uint256`|Amount of tokens|


### _unsetClaimedBitmap

unset a claim from the claimedBitmap


```solidity
function _unsetClaimedBitmap(uint32 leafIndex, uint32 sourceBridgeNetwork) private;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### isClaimed

Function to check if an index is claimed or not

function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context


```solidity
function isClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) public view virtual override returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### _setAndCheckClaimed

Function to check that an index is not claimed and set it as claimed

function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context


```solidity
function _setAndCheckClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### activateEmergencyState


```solidity
function activateEmergencyState()
    external
    virtual
    override(IAgglayerBridge, AgglayerBridge)
    onlyEmergencyBridgePauser;
```

### deactivateEmergencyState


```solidity
function deactivateEmergencyState()
    external
    virtual
    override(IAgglayerBridge, AgglayerBridge)
    onlyEmergencyBridgeUnpauser;
```

### _decreaseLocalBalanceTree

Function to decrease the local balance tree


```solidity
function _decreaseLocalBalanceTree(uint32 originNetwork, address originTokenAddress, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address|
|`amount`|`uint256`|Amount to decrease|


### _increaseLocalBalanceTree

Function to increase the local balance tree


```solidity
function _increaseLocalBalanceTree(uint32 originNetwork, address originTokenAddress, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address|
|`amount`|`uint256`|Amount to increase|


### _addLeafBridge

Function to add a new leaf to the bridge merkle tree


```solidity
function _addLeafBridge(
    uint8 leafType,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes32 metadataHash
) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafType`|`uint8`|leaf type|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Destination network|
|`destinationAddress`|`address`|Destination address|
|`amount`|`uint256`|Amount of tokens|
|`metadataHash`|`bytes32`|Metadata hash|


### _verifyLeafAndSetNullifier

Get leaf value and verify the merkle proof


```solidity
function _verifyLeafAndSetNullifier(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint8 leafType,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes memory metadata
) internal override;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`leafType`|`uint8`|Leaf type|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Raw metadata bytes|


### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure virtual override returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version of the contract.|


## Events
### SetBridgeManager
Emitted when a bridge manager is updated


```solidity
event SetBridgeManager(address bridgeManager);
```

### TransferEmergencyBridgePauserRole
Emitted when the emergencyBridgePauser starts the two-step transfer role setting a new pending emergencyBridgePauser.


```solidity
event TransferEmergencyBridgePauserRole(address currentEmergencyBridgePauser, address newEmergencyBridgePauser);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentEmergencyBridgePauser`|`address`|The current emergencyBridgePauser.|
|`newEmergencyBridgePauser`|`address`|The new pending emergencyBridgePauser.|

### AcceptEmergencyBridgePauserRole
Emitted when the pending emergencyBridgePauser accepts the emergencyBridgePauser role.


```solidity
event AcceptEmergencyBridgePauserRole(address oldEmergencyBridgePauser, address newEmergencyBridgePauser);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldEmergencyBridgePauser`|`address`|The previous emergencyBridgePauser.|
|`newEmergencyBridgePauser`|`address`|The new emergencyBridgePauser.|

### TransferEmergencyBridgeUnpauserRole
Emitted when the emergencyBridgeUnpauser starts the two-step transfer role setting a new pending emergencyBridgeUnpauser.


```solidity
event TransferEmergencyBridgeUnpauserRole(
    address currentEmergencyBridgeUnpauser, address newEmergencyBridgeUnpauser
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentEmergencyBridgeUnpauser`|`address`|The current emergencyBridgeUnpauser.|
|`newEmergencyBridgeUnpauser`|`address`|The new pending emergencyBridgeUnpauser.|

### AcceptEmergencyBridgeUnpauserRole
Emitted when the pending emergencyBridgeUnpauser accepts the emergencyBridgeUnpauser role.


```solidity
event AcceptEmergencyBridgeUnpauserRole(address oldEmergencyBridgeUnpauser, address newEmergencyBridgeUnpauser);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldEmergencyBridgeUnpauser`|`address`|The previous emergencyBridgeUnpauser.|
|`newEmergencyBridgeUnpauser`|`address`|The new emergencyBridgeUnpauser.|

### SetSovereignTokenAddress
Emitted when a token address is remapped by a sovereign token address


```solidity
event SetSovereignTokenAddress(
    uint32 originNetwork, address originTokenAddress, address sovereignTokenAddress, bool isNotMintable
);
```

### MigrateLegacyToken
Emitted when a legacy token is migrated to a new token


```solidity
event MigrateLegacyToken(address sender, address legacyTokenAddress, address updatedTokenAddress, uint256 amount);
```

### RemoveLegacySovereignTokenAddress
Emitted when a remapped token is removed from mapping


```solidity
event RemoveLegacySovereignTokenAddress(address sovereignTokenAddress);
```

### SetSovereignWETHAddress
Emitted when a WETH address is remapped by a sovereign WETH address


```solidity
event SetSovereignWETHAddress(address sovereignWETHTokenAddress, bool isNotMintable);
```

### UpdatedClaimedGlobalIndexHashChain
Emitted when the claimed global index hash chain is updated (new claim)


```solidity
event UpdatedClaimedGlobalIndexHashChain(bytes32 claimedGlobalIndex, bytes32 newClaimedGlobalIndexHashChain);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`claimedGlobalIndex`|`bytes32`|Global index added to the hash chain|
|`newClaimedGlobalIndexHashChain`|`bytes32`|New global index hash chain value|

### UpdatedUnsetGlobalIndexHashChain
Emitted when the unset global index hash chain is updated


```solidity
event UpdatedUnsetGlobalIndexHashChain(bytes32 unsetGlobalIndex, bytes32 newUnsetGlobalIndexHashChain);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`unsetGlobalIndex`|`bytes32`|Global index added to the hash chain|
|`newUnsetGlobalIndexHashChain`|`bytes32`|New global index hash chain value|

### SetClaim
Emitted when a claim is set


```solidity
event SetClaim(bytes32 globalIndex);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalIndex`|`bytes32`|Global index set|

### BackwardLET
Emitted when local exit tree is moved backward


```solidity
event BackwardLET(uint256 previousDepositCount, bytes32 previousRoot, uint256 newDepositCount, bytes32 newRoot);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`previousDepositCount`|`uint256`|The deposit count before moving backward|
|`previousRoot`|`bytes32`|The root of the local exit tree before moving backward|
|`newDepositCount`|`uint256`|The resulting deposit count after moving backward|
|`newRoot`|`bytes32`|The resulting root of the local exit tree after moving backward|

### ForwardLET
Emitted when local exit tree is moved forward


```solidity
event ForwardLET(
    uint256 previousDepositCount, bytes32 previousRoot, uint256 newDepositCount, bytes32 newRoot, bytes newLeaves
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`previousDepositCount`|`uint256`|The deposit count before moving forward|
|`previousRoot`|`bytes32`|The root of the local exit tree before moving forward|
|`newDepositCount`|`uint256`|The resulting deposit count after moving forward|
|`newRoot`|`bytes32`|The resulting root of the local exit tree after moving forward|
|`newLeaves`|`bytes`|The raw bytes of all new leaves added|

### SetLocalBalanceTree
Emitted when local balance tree is updated


```solidity
event SetLocalBalanceTree(uint32 indexed originNetwork, address indexed originTokenAddress, uint256 newAmount);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|The origin network of the set leaf|
|`originTokenAddress`|`address`|The origin token address of the set leaf|
|`newAmount`|`uint256`|The new amount set for this token|

### DetailedClaimEvent
Emitted when a claim is processed on L2 rollups for better gas efficiency

This event can be emitted on rollups because gas costs are cheaper than on L1


```solidity
event DetailedClaimEvent(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot,
    uint256 indexed globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint8 leafType,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address indexed destinationAddress,
    uint256 amount,
    bytes metadata
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the network exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index of the claim|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`leafType`|`uint8`||
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|

## Structs
### LeafData

```solidity
struct LeafData {
    uint8 leafType;
    uint32 originNetwork;
    address originAddress;
    uint32 destinationNetwork;
    address destinationAddress;
    uint256 amount;
    bytes metadata;
}
```

### ClaimData
Struct to represent claim data for forceEmitDetailedClaimEvent function

Contains all parameters needed to verify and emit a DetailedClaimEvent


```solidity
struct ClaimData {
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot;
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot;
    uint256 globalIndex;
    bytes32 mainnetExitRoot;
    bytes32 rollupExitRoot;
    uint8 leafType;
    uint32 originNetwork;
    address originAddress;
    uint32 destinationNetwork;
    address destinationAddress;
    uint256 amount;
    bytes metadata;
}
```

