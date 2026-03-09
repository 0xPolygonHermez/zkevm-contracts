# AgglayerBridge
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/AgglayerBridge.sol)

**Inherits:**
[DepositContractV2](/contracts/lib/DepositContractV2.sol/contract.DepositContractV2.md), [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [IAgglayerBridge](/contracts/interfaces/IAgglayerBridge.sol/interface.IAgglayerBridge.md), [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

PolygonZkEVMBridge that will be deployed on Ethereum and all Polygon rollups
Contract responsible to manage the token interactions with other networks


## State Variables
### bridgeLib
Instance of the BridgeLib contract deployed for bytecode optimization
Also contains the bytecode to deploy wrapped tokens, upgradeable tokens and the code of the transparent proxy

those functions been exported to a separate contract to improve this bytecode length.

**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
BridgeLib public immutable bridgeLib
```


### wrappedTokenBridgeImplementation
Address of the wrappedToken implementation, it is set at constructor and all proxied wrapped tokens will point to this implementation

**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address internal immutable wrappedTokenBridgeImplementation
```


### _MAINNET_NETWORK_ID

```solidity
uint32 internal constant _MAINNET_NETWORK_ID = 0
```


### _ZKEVM_NETWORK_ID

```solidity
uint32 private constant _ZKEVM_NETWORK_ID = 1
```


### _LEAF_TYPE_ASSET

```solidity
uint8 internal constant _LEAF_TYPE_ASSET = 0
```


### _LEAF_TYPE_MESSAGE

```solidity
uint8 internal constant _LEAF_TYPE_MESSAGE = 1
```


### _MAX_LEAFS_PER_NETWORK

```solidity
uint256 internal constant _MAX_LEAFS_PER_NETWORK = 2 ** 32
```


### _GLOBAL_INDEX_MAINNET_FLAG

```solidity
uint256 internal constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64
```


### BRIDGE_VERSION

```solidity
string internal constant BRIDGE_VERSION = "v1.1.0"
```


### networkID

```solidity
uint32 public networkID
```


### globalExitRootManager

```solidity
IBaseLegacyAgglayerGER public globalExitRootManager
```


### lastUpdatedDepositCount

```solidity
uint32 public lastUpdatedDepositCount
```


### claimedBitMap

```solidity
mapping(uint256 => uint256) public claimedBitMap
```


### tokenInfoToWrappedToken

```solidity
mapping(bytes32 => address) public tokenInfoToWrappedToken
```


### wrappedTokenToTokenInfo

```solidity
mapping(address => TokenInformation) public wrappedTokenToTokenInfo
```


### polygonRollupManager
**Note:**
oz-renamed-from: polygonZkEVMaddress


```solidity
address public polygonRollupManager
```


### gasTokenAddress

```solidity
address public gasTokenAddress
```


### gasTokenNetwork

```solidity
uint32 public gasTokenNetwork
```


### gasTokenMetadata

```solidity
bytes public gasTokenMetadata
```


### WETHToken

```solidity
ITokenWrappedBridgeUpgradeable public WETHToken
```


### proxiedTokensManager

```solidity
address internal proxiedTokensManager
```


### pendingProxiedTokensManager

```solidity
address public pendingProxiedTokensManager
```


### _initializerVersion
This mechanism is used to properly select the initializer


```solidity
uint8 internal _initializerVersion
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[48] private __gap
```


## Functions
### getInitializedVersion

Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.


```solidity
modifier getInitializedVersion() ;
```

### constructor


```solidity
constructor() ;
```

### initialize

The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge, intentionally


```solidity
function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    IBaseLegacyAgglayerGER _globalExitRootManager,
    address _polygonRollupManager,
    bytes memory _gasTokenMetadata
) external virtual getInitializedVersion reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_gasTokenAddress`|`address`|gas token address|
|`_gasTokenNetwork`|`uint32`|gas token network|
|`_globalExitRootManager`|`IBaseLegacyAgglayerGER`|global exit root manager address|
|`_polygonRollupManager`|`address`|polygonZkEVM address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|


### onlyRollupManager


```solidity
modifier onlyRollupManager() ;
```

### _setProxiedTokensManagerFromProxy

Set PolygonTimelock contract address as proxied tokens manager, the owner of current proxy contract


```solidity
function _setProxiedTokensManagerFromProxy() private;
```

### bridgeAsset

Deposit add a new leaf to the merkle tree
note If this function is called with a reentrant token, it would be possible to `claimTokens` in the same call
Reducing the supply of tokens on this contract, and actually locking tokens in the contract.
Therefore we recommend to third parties bridges that if they do implement reentrant call of `beforeTransfer` of some reentrant tokens
do not call any external address in that case
note User/UI must be aware of the existing/available networks when choosing the destination network


```solidity
function bridgeAsset(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    address token,
    bool forceUpdateGlobalExitRoot,
    bytes calldata permitData
) public payable virtual ifNotEmergencyState nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`token`|`address`|Token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`forceUpdateGlobalExitRoot`|`bool`|Indicates if the new global exit root is updated or not|
|`permitData`|`bytes`|Raw data of the call `permit` of the token|


### bridgeMessage

Bridge message and send ETH value
note User/UI must be aware of the existing/available networks when choosing the destination network


```solidity
function bridgeMessage(
    uint32 destinationNetwork,
    address destinationAddress,
    bool forceUpdateGlobalExitRoot,
    bytes calldata metadata
) external payable virtual ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`forceUpdateGlobalExitRoot`|`bool`|Indicates if the new global exit root is updated or not|
|`metadata`|`bytes`|Message metadata|


### bridgeMessageWETH

Bridge message and send ETH value
note User/UI must be aware of the existing/available networks when choosing the destination network


```solidity
function bridgeMessageWETH(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amountWETH,
    bool forceUpdateGlobalExitRoot,
    bytes calldata metadata
) external virtual ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amountWETH`|`uint256`|Amount of WETH tokens|
|`forceUpdateGlobalExitRoot`|`bool`|Indicates if the new global exit root is updated or not|
|`metadata`|`bytes`|Message metadata|


### _bridgeMessage

Bridge message and send ETH value


```solidity
function _bridgeMessage(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amountEther,
    bool forceUpdateGlobalExitRoot,
    bytes calldata metadata
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amountEther`|`uint256`|Amount of ether along with the message|
|`forceUpdateGlobalExitRoot`|`bool`|Indicates if the new global exit root is updated or not|
|`metadata`|`bytes`|Message metadata|


### claimAsset

Verify merkle proof and withdraw tokens/ether


```solidity
function claimAsset(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata
) public virtual ifNotEmergencyState nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the network exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`| Origin token address,|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### claimMessage

Verify merkle proof and execute message
If the receiving address is an EOA, the call will result as a success
Which means that the amount of ether will be transferred correctly, but the message
will not trigger any execution

any modification to this function must be done with caution, since this function has no re-entrancy check

function has not reentrancy check in purpose to not stop potential functionalities:
- give funds back in case a message fails
- composability on claimMessage and claimAsset


```solidity
function claimMessage(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata
) external virtual ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### _verifyLeafAndSetNullifier

Verify leaf merkle proof and mark the claim as processed (set nullifier)

This function combines leaf verification with nullifier setting to prevent double-claiming
The metadata parameter is provided as raw bytes instead of pre-hashed to allow child contracts
to emit it in events (particularly useful in AgglayerBridgeL2 for DetailedClaimEvent)


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
) internal virtual;
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
|`metadata`|`bytes`|Raw metadata bytes (will be hashed for leaf value computation)|


### getTokenWrappedAddress

Returns the address of a wrapper using the token information if already exist


```solidity
function getTokenWrappedAddress(uint32 originNetwork, address originTokenAddress)
    external
    view
    virtual
    returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, address of the token at the origin network.|


### activateEmergencyState

Function to activate the emergency state
" Only can be called by the Polygon ZK-EVM in extreme situations


```solidity
function activateEmergencyState() external virtual onlyRollupManager;
```

### deactivateEmergencyState

Function to deactivate the emergency state
" Only can be called by the Polygon ZK-EVM


```solidity
function deactivateEmergencyState() external virtual onlyRollupManager;
```

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
) internal virtual;
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


### _verifyLeaf

Verify leaf and extract source network information

This function verifies the merkle proofs but does NOT set the claimed nullifier


```solidity
function _verifyLeaf(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    bytes32 leafValue
) internal virtual returns (uint32, uint32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`globalIndex`|`uint256`|Index of the leaf|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`leafValue`|`bytes32`|leaf value|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint32`|leafIndex The index of the leaf in the local exit root|
|`<none>`|`uint32`|sourceBridgeNetwork The source network identifier extracted from globalIndex|


### isClaimed

Function to check if an index is claimed or not


```solidity
function isClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) public view virtual returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### _setAndCheckClaimed

Function to check that an index is not claimed and set it as claimed


```solidity
function _setAndCheckClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) internal virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|Index|
|`sourceBridgeNetwork`|`uint32`|Origin network|


### transferProxiedTokensManagerRole

Starts the ProxiedTokensManager role transfer
This is a two step process, the pending ProxiedTokensManager must accepted to finalize the process


```solidity
function transferProxiedTokensManagerRole(address newProxiedTokensManager) external virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newProxiedTokensManager`|`address`|Address of the new pending ProxiedTokensManager|


### acceptProxiedTokensManagerRole

Allow the current pending ProxiedTokensManager to accept the ProxiedTokensManager role


```solidity
function acceptProxiedTokensManagerRole() external virtual;
```

### updateGlobalExitRoot

Function to update the globalExitRoot if the last deposit is not submitted


```solidity
function updateGlobalExitRoot() external virtual;
```

### _updateGlobalExitRoot

Function to update the globalExitRoot


```solidity
function _updateGlobalExitRoot() internal;
```

### _bridgeWrappedAsset

Burn tokens from wrapped token to execute the bridge
note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain


```solidity
function _bridgeWrappedAsset(ITokenWrappedBridgeUpgradeable tokenWrapped, uint256 amount)
    internal
    virtual
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`ITokenWrappedBridgeUpgradeable`|Wrapped token to burnt|
|`amount`|`uint256`|Amount of tokens|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Amount of tokens that must be added to the leaf after the bridge operation|


### _claimWrappedAsset

Mints tokens from wrapped token to proceed with the claim
note This  function has been extracted to be able to override it by other contracts like Bridge2SovereignChain


```solidity
function _claimWrappedAsset(ITokenWrappedBridgeUpgradeable tokenWrapped, address destinationAddress, uint256 amount)
    internal
    virtual;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenWrapped`|`ITokenWrappedBridgeUpgradeable`|Proxied Wrapped token to mint|
|`destinationAddress`|`address`|Minted token receiver|
|`amount`|`uint256`|Amount of tokens|


### _bitmapPositions

Function decode an index into a wordPos and bitPos


```solidity
function _bitmapPositions(uint256 index) internal pure returns (uint256 wordPos, uint256 bitPos);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index|


### _validateAndDecodeGlobalIndex

Internal function to validate and decode global index

Validates global index format and extracts leafIndex, indexRollup, and sourceBridgeNetwork


```solidity
function _validateAndDecodeGlobalIndex(uint256 globalIndex)
    internal
    pure
    returns (uint32 leafIndex, uint32 indexRollup, uint32 sourceBridgeNetwork);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalIndex`|`uint256`|The global index to validate and decode, defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex ||

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`leafIndex`|`uint32`|The leaf index extracted from global index|
|`indexRollup`|`uint32`|The rollup index extracted from global index (0 for mainnet)|
|`sourceBridgeNetwork`|`uint32`|The source bridge network (0 for mainnet, indexRollup + 1 for rollups)|


### _permit

Function to call token permit method of extended ERC20


```solidity
function _permit(address token, bytes calldata permitData) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|ERC20 token address|
|`permitData`|`bytes`|Raw data of the call `permit` of the token|


### _deployWrappedToken

Internal function that uses create2 to deploy the upgradable wrapped tokens


```solidity
function _deployWrappedToken(bytes32 salt, bytes memory initializationArgs)
    internal
    returns (ITokenWrappedBridgeUpgradeable newWrappedTokenProxy);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`salt`|`bytes32`|Salt used in create2 params, tokenInfoHash will be used as salt for all wrapped except for bridge native WETH, that will be bytes32(0)|
|`initializationArgs`|`bytes`|Encoded constructor args for the wrapped token|


### getProxiedTokensManager

Returns internal proxiedTokensManager address


```solidity
function getProxiedTokensManager() external view virtual returns (address);
```

### getWrappedTokenBridgeImplementation

This function is used to get the implementation address of the wrapped token bridge


```solidity
function getWrappedTokenBridgeImplementation() external view virtual returns (address);
```

### getTokenMetadata

Returns the encoded token metadata


```solidity
function getTokenMetadata(address token) external view virtual returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Address of the token|


### INIT_BYTECODE_TRANSPARENT_PROXY

Returns the INIT_BYTECODE_TRANSPARENT_PROXY from the BridgeLib


```solidity
function INIT_BYTECODE_TRANSPARENT_PROXY() public view virtual returns (bytes memory);
```

### computeTokenProxyAddress

Returns the precalculated address of a upgradeable wrapped token using the token information


```solidity
function computeTokenProxyAddress(uint32 originNetwork, address originTokenAddress)
    public
    view
    virtual
    returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, address of the token at the origin network.|


### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure virtual returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version of the contract.|


## Events
### BridgeEvent
Emitted when bridge assets or messages to another network


```solidity
event BridgeEvent(
    uint8 leafType,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata,
    uint32 depositCount
);
```

### ClaimEvent
Emitted when a claim is done from another network


```solidity
event ClaimEvent(
    uint256 globalIndex, uint32 originNetwork, address originAddress, address destinationAddress, uint256 amount
);
```

### NewWrappedToken
Emitted when a new wrapped token is created


```solidity
event NewWrappedToken(
    uint32 originNetwork, address originTokenAddress, address wrappedTokenAddress, bytes metadata
);
```

### AcceptProxiedTokensManagerRole
Emitted when the pending ProxiedTokensManager accepts the ProxiedTokensManager role.


```solidity
event AcceptProxiedTokensManagerRole(address oldProxiedTokensManager, address newProxiedTokensManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldProxiedTokensManager`|`address`|The previous ProxiedTokensManager.|
|`newProxiedTokensManager`|`address`|The new ProxiedTokensManager.|

### TransferProxiedTokensManagerRole
Emitted when the proxiedTokensManager starts the two-step transfer role setting a new pending proxiedTokensManager.


```solidity
event TransferProxiedTokensManagerRole(address currentProxiedTokensManager, address newProxiedTokensManager);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`currentProxiedTokensManager`|`address`|The current proxiedTokensManager.|
|`newProxiedTokensManager`|`address`|The new pending proxiedTokensManager.|

## Structs
### TokenInformation

```solidity
struct TokenInformation {
    uint32 originNetwork;
    address originTokenAddress;
}
```

