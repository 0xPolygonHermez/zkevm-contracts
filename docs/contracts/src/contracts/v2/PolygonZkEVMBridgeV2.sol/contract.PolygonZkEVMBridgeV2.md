# PolygonZkEVMBridgeV2
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/PolygonZkEVMBridgeV2.sol)

**Inherits:**
[DepositContractV2](/contracts/v2/lib/DepositContractV2.sol/contract.DepositContractV2.md), [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [IPolygonZkEVMBridgeV2](/contracts/v2/interfaces/IPolygonZkEVMBridgeV2.sol/interface.IPolygonZkEVMBridgeV2.md)

PolygonZkEVMBridge that will be deployed on Ethereum and all Polygon rollups
Contract responsible to manage the token interactions with other networks


## State Variables
### wrappedTokenBytecodeStorer
*the constant has been exported to a separate contract to improve this bytecode length.*

**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IBytecodeStorer public immutable wrappedTokenBytecodeStorer;
```


### wrappedTokenBridgeImplementation
Address of the wrappedToken implementation, it is set at constructor and all proxied wrapped tokens will point to this implementation

**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
address internal immutable wrappedTokenBridgeImplementation;
```


### _PERMIT_SIGNATURE

```solidity
bytes4 internal constant _PERMIT_SIGNATURE = 0xd505accf;
```


### _PERMIT_SIGNATURE_DAI

```solidity
bytes4 internal constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;
```


### _MAINNET_NETWORK_ID

```solidity
uint32 internal constant _MAINNET_NETWORK_ID = 0;
```


### _ZKEVM_NETWORK_ID

```solidity
uint32 private constant _ZKEVM_NETWORK_ID = 1;
```


### _LEAF_TYPE_ASSET

```solidity
uint8 internal constant _LEAF_TYPE_ASSET = 0;
```


### _LEAF_TYPE_MESSAGE

```solidity
uint8 internal constant _LEAF_TYPE_MESSAGE = 1;
```


### _MAX_LEAFS_PER_NETWORK

```solidity
uint256 internal constant _MAX_LEAFS_PER_NETWORK = 2 ** 32;
```


### _GLOBAL_INDEX_MAINNET_FLAG

```solidity
uint256 internal constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;
```


### BRIDGE_VERSION

```solidity
string public constant BRIDGE_VERSION = "al-v0.3.0";
```


### networkID

```solidity
uint32 public networkID;
```


### globalExitRootManager

```solidity
IBasePolygonZkEVMGlobalExitRoot public globalExitRootManager;
```


### lastUpdatedDepositCount

```solidity
uint32 public lastUpdatedDepositCount;
```


### claimedBitMap

```solidity
mapping(uint256 => uint256) public claimedBitMap;
```


### tokenInfoToWrappedToken

```solidity
mapping(bytes32 => address) public tokenInfoToWrappedToken;
```


### wrappedTokenToTokenInfo

```solidity
mapping(address => TokenInformation) public wrappedTokenToTokenInfo;
```


### polygonRollupManager
**Note:**
oz-renamed-from: polygonZkEVMaddress


```solidity
address public polygonRollupManager;
```


### gasTokenAddress

```solidity
address public gasTokenAddress;
```


### gasTokenNetwork

```solidity
uint32 public gasTokenNetwork;
```


### gasTokenMetadata

```solidity
bytes public gasTokenMetadata;
```


### WETHToken

```solidity
ITokenWrappedBridgeUpgradeable public WETHToken;
```


### proxiedTokensManager

```solidity
address public proxiedTokensManager;
```


### pendingProxiedTokensManager

```solidity
address public pendingProxiedTokensManager;
```


### _initializerVersion
This mechanism is used to properly select the initializer


```solidity
uint8 internal _initializerVersion;
```


### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.*


```solidity
uint256[48] private __gap;
```


## Functions
### getInitializedVersion

*Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.*


```solidity
modifier getInitializedVersion();
```

### constructor


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
    bytes memory _gasTokenMetadata
) external virtual getInitializedVersion reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_gasTokenAddress`|`address`|gas token address|
|`_gasTokenNetwork`|`uint32`|gas token network|
|`_globalExitRootManager`|`IBasePolygonZkEVMGlobalExitRoot`|global exit root manager address|
|`_polygonRollupManager`|`address`|polygonZkEVM address|
|`_gasTokenMetadata`|`bytes`|Abi encoded gas token metadata|


### initialize

initializer to set PolygonTimelock as proxiedTokensManager


```solidity
function initialize() public virtual getInitializedVersion reinitializer(2);
```

### onlyRollupManager


```solidity
modifier onlyRollupManager();
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
) external payable ifNotEmergencyState;
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
) external ifNotEmergencyState;
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
) external ifNotEmergencyState nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the network exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 note that global index do not assert the unused bits to 0. This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
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

*any modification to this function must be done with caution, since this function has no re-entrancy check*

*function has not reentrancy check in purpose to not stop potential functionalities:
- give funds back in case a message fails
- composability on claimMessage and claimAsset*


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
) external ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProofLocalExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the leaf against the exit root|
|`smtProofRollupExitRoot`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof to proof the rollupLocalExitRoot against the rollups exit root|
|`globalIndex`|`uint256`|Global index is defined as: | 191 bits |    1 bit     |   32 bits   |     32 bits    | |    0     |  mainnetFlag | rollupIndex | localRootIndex | note that only the rollup index will be used only in case the mainnet flag is 0 note that global index do not assert the unused bits to 0. This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract to avoid possible synch attacks|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### _verifyLeafBridge

Get leaf value and verify the merkle proof


```solidity
function _verifyLeafBridge(
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
    bytes32 metadataHash
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
|`metadataHash`|`bytes32`|Hash of the metadata|


### getTokenWrappedAddress

Returns the address of a wrapper using the token information if already exist


```solidity
function getTokenWrappedAddress(uint32 originNetwork, address originTokenAddress) external view returns (address);
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

Verify leaf and checks that it has not been claimed


```solidity
function _verifyLeaf(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    uint256 globalIndex,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    bytes32 leafValue
) internal virtual;
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


### isClaimed

Function to check if an index is claimed or not


```solidity
function isClaimed(uint32 leafIndex, uint32 sourceBridgeNetwork) external view virtual returns (bool);
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
function transferProxiedTokensManagerRole(address newProxiedTokensManager) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newProxiedTokensManager`|`address`|Address of the new pending ProxiedTokensManager|


### acceptProxiedTokensManagerRole

Allow the current pending ProxiedTokensManager to accept the ProxiedTokensManager role


```solidity
function acceptProxiedTokensManagerRole() external;
```

### updateGlobalExitRoot

Function to update the globalExitRoot if the last deposit is not submitted


```solidity
function updateGlobalExitRoot() external;
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


### _permit

Function to call token permit method of extended ERC20
+ @param token ERC20 token address


```solidity
function _permit(address token, bytes calldata permitData) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`||
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
function getProxiedTokensManager() external view returns (address);
```

### getWrappedTokenBridgeImplementation

This function is used to get the implementation address of the wrapped token bridge


```solidity
function getWrappedTokenBridgeImplementation() external view returns (address);
```

### _safeSymbol

Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string


```solidity
function _safeSymbol(address token) internal view returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The address of the ERC-20 token contract|


### _safeName

Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.


```solidity
function _safeName(address token) internal view returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The address of the ERC-20 token contract.|


### _safeDecimals

Provides a safe ERC20.decimals version which returns '18' as fallback value.
Note Tokens with (decimals > 255) are not supported


```solidity
function _safeDecimals(address token) internal view returns (uint8);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|The address of the ERC-20 token contract|


### _returnDataToString

Function to convert returned data to string
returns 'NOT_VALID_ENCODING' as fallback value.


```solidity
function _returnDataToString(bytes memory data) internal pure returns (string memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`data`|`bytes`|returned data|


### getTokenMetadata

Returns the encoded token metadata


```solidity
function getTokenMetadata(address token) public view returns (bytes memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Address of the token|


### INIT_BYTECODE_TRANSPARENT_PROXY

Returns the INIT_BYTECODE_TRANSPARENT_PROXY from the BytecodeStorer

*BytecodeStorer is a contract that contains PolygonTransparentProxy as constant, it has done this way to have more bytecode available.
Using the on chain bytecode, we assure that transparent proxy is always deployed with the exact same bytecode, necessary to have all deployed wrapped token
with the same address on all the chains.*


```solidity
function INIT_BYTECODE_TRANSPARENT_PROXY() public view returns (bytes memory);
```

### computeTokenProxyAddress

Returns the precalculated address of a upgradeable wrapped token using the token information


```solidity
function computeTokenProxyAddress(uint32 originNetwork, address originTokenAddress) public view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, address of the token at the origin network.|


## Events
### BridgeEvent
*Emitted when bridge assets or messages to another network*


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
*Emitted when a claim is done from another network*


```solidity
event ClaimEvent(
    uint256 globalIndex, uint32 originNetwork, address originAddress, address destinationAddress, uint256 amount
);
```

### NewWrappedToken
*Emitted when a new wrapped token is created*


```solidity
event NewWrappedToken(uint32 originNetwork, address originTokenAddress, address wrappedTokenAddress, bytes metadata);
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

