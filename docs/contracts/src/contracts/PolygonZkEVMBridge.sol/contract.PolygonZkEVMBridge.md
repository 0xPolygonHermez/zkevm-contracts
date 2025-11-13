# PolygonZkEVMBridge
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/PolygonZkEVMBridge.sol)

**Inherits:**
[DepositContract](/contracts/lib/DepositContract.sol/contract.DepositContract.md), [EmergencyManager](/contracts/lib/EmergencyManager.sol/contract.EmergencyManager.md), [IPolygonZkEVMBridge](/contracts/interfaces/IPolygonZkEVMBridge.sol/interface.IPolygonZkEVMBridge.md)

PolygonZkEVMBridge that will be deployed on both networks Ethereum and Polygon zkEVM
Contract responsible to manage the token interactions with other networks


## State Variables
### _PERMIT_SIGNATURE

```solidity
bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;
```


### _PERMIT_SIGNATURE_DAI

```solidity
bytes4 private constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;
```


### _MAINNET_NETWORK_ID

```solidity
uint32 private constant _MAINNET_NETWORK_ID = 0;
```


### _CURRENT_SUPPORTED_NETWORKS

```solidity
uint32 private constant _CURRENT_SUPPORTED_NETWORKS = 2;
```


### _LEAF_TYPE_ASSET

```solidity
uint8 private constant _LEAF_TYPE_ASSET = 0;
```


### _LEAF_TYPE_MESSAGE

```solidity
uint8 private constant _LEAF_TYPE_MESSAGE = 1;
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


### polygonZkEVMaddress

```solidity
address public polygonZkEVMaddress;
```


## Functions
### initialize

The value of `_polygonZkEVMaddress` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge, intentionally


```solidity
function initialize(
    uint32 _networkID,
    IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonZkEVMaddress
) external virtual initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_networkID`|`uint32`|networkID|
|`_globalExitRootManager`|`IBasePolygonZkEVMGlobalExitRoot`|global exit root manager address|
|`_polygonZkEVMaddress`|`address`|polygonZkEVM address|


### onlyPolygonZkEVM


```solidity
modifier onlyPolygonZkEVM();
```

### bridgeAsset

Deposit add a new leaf to the merkle tree
note If this function is called with a reentrant token, it would be possible to `claimTokens` in the same call
Reducing the supply of tokens on this contract, and actually locking tokens in the contract.
Therefore we recommend to third parties bridges that if they do implement reentrant call of `beforeTransfer` of some reentrant tokens
do not call any external address in that case


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


### claimAsset

Verify merkle proof and withdraw tokens/ether


```solidity
function claimAsset(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata
) external ifNotEmergencyState;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`| Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### claimMessage

Verify merkle proof and execute message
If the receiving address is an EOA, the call will result as a success
Which means that the amount of ether will be transferred correctly, but the message
will not trigger any execution


```solidity
function claimMessage(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
    uint32 index,
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
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|message value|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|


### precalculatedWrapperAddress

Returns the precalculated address of a wrapper using the token information
Note Updating the metadata of a token is not supported.
Since the metadata has relevance in the address deployed, this function will not return a valid
wrapped address if the metadata provided is not the original one.


```solidity
function precalculatedWrapperAddress(
    uint32 originNetwork,
    address originTokenAddress,
    string calldata name,
    string calldata symbol,
    uint8 decimals
) external view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`name`|`string`|Name of the token|
|`symbol`|`string`|Symbol of the token|
|`decimals`|`uint8`|Decimals of the token|


### getTokenWrappedAddress

Returns the address of a wrapper using the token information if already exist


```solidity
function getTokenWrappedAddress(uint32 originNetwork, address originTokenAddress) external view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`originNetwork`|`uint32`|Origin network|
|`originTokenAddress`|`address`|Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|


### activateEmergencyState

Function to activate the emergency state
" Only can be called by the Polygon ZK-EVM in extreme situations


```solidity
function activateEmergencyState() external onlyPolygonZkEVM;
```

### deactivateEmergencyState

Function to deactivate the emergency state
" Only can be called by the Polygon ZK-EVM


```solidity
function deactivateEmergencyState() external onlyPolygonZkEVM;
```

### _verifyLeaf

Verify leaf and checks that it has not been claimed


```solidity
function _verifyLeaf(
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes calldata metadata,
    uint8 leafType
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smtProof`|`bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]`|Smt proof|
|`index`|`uint32`|Index of the leaf|
|`mainnetExitRoot`|`bytes32`|Mainnet exit root|
|`rollupExitRoot`|`bytes32`|Rollup exit root|
|`originNetwork`|`uint32`|Origin network|
|`originAddress`|`address`|Origin address|
|`destinationNetwork`|`uint32`|Network destination|
|`destinationAddress`|`address`|Address destination|
|`amount`|`uint256`|Amount of tokens|
|`metadata`|`bytes`|Abi encoded metadata if any, empty otherwise|
|`leafType`|`uint8`|Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message|


### isClaimed

Function to check if an index is claimed or not


```solidity
function isClaimed(uint256 index) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index|


### _setAndCheckClaimed

Function to check that an index is not claimed and set it as claimed


```solidity
function _setAndCheckClaimed(uint256 index) private;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index|


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

### _bitmapPositions

Function decode an index into a wordPos and bitPos


```solidity
function _bitmapPositions(uint256 index) private pure returns (uint256 wordPos, uint256 bitPos);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index|


### _permit

Function to call token permit method of extended ERC20
+ @param token ERC20 token address


```solidity
function _permit(address token, uint256 amount, bytes calldata permitData) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`||
|`amount`|`uint256`|Quantity that is expected to be allowed|
|`permitData`|`bytes`|Raw data of the call `permit` of the token|


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
event ClaimEvent(uint32 index, uint32 originNetwork, address originAddress, address destinationAddress, uint256 amount);
```

### NewWrappedToken
*Emitted when a new wrapped token is created*


```solidity
event NewWrappedToken(uint32 originNetwork, address originTokenAddress, address wrappedTokenAddress, bytes metadata);
```

## Structs
### TokenInformation

```solidity
struct TokenInformation {
    uint32 originNetwork;
    address originTokenAddress;
}
```

