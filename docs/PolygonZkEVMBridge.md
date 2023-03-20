PolygonZkEVMBridge that will be deployed on both networks Ethereum and Polygon zkEVM
Contract responsible to manage the token interactions with other networks


## Functions
### initialize
```solidity
  function initialize(
    uint32 _networkID,
    contract IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonZkEVMaddress
  ) external
```
The value of `_polygonZkEVMaddress` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge, intentionally

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_networkID` | uint32 | networkID
|`_globalExitRootManager` | contract IBasePolygonZkEVMGlobalExitRoot | global exit root manager address
|`_polygonZkEVMaddress` | address | polygonZkEVM address


### bridgeAsset
```solidity
  function bridgeAsset(
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    address token,
    bool forceUpdateGlobalExitRoot,
    bytes permitData
  ) public
```
Deposit add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | Amount of tokens
|`token` | address | Token address, 0 address is reserved for ether
|`forceUpdateGlobalExitRoot` | bool | Indicates if the new global exit root is updated or not
|`permitData` | bytes | Raw data of the call `permit` of the token

### bridgeMessage
```solidity
  function bridgeMessage(
    uint32 destinationNetwork,
    address destinationAddress,
    bool forceUpdateGlobalExitRoot,
    bytes metadata
  ) external
```
Bridge message and send ETH value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`forceUpdateGlobalExitRoot` | bool | Indicates if the new global exit root is updated or not
|`metadata` | bytes | Message metadata

### claimAsset
```solidity
  function claimAsset(
    bytes32[32] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
  ) external
```
Verify merkle proof and withdraw tokens/ether


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`smtProof` | bytes32[32] | Smt proof
|`index` | uint32 | Index of the leaf
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address |  Origin token address, 0 address is reserved for ether
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | Amount of tokens
|`metadata` | bytes | Abi encoded metadata if any, empty otherwise

### claimMessage
```solidity
  function claimMessage(
    bytes32[32] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
  ) external
```
Verify merkle proof and execute message
If the receiving address is an EOA, the call will result as a success
Which means that the amount of ether will be transferred correctly, but the message
will not trigger any execution


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`smtProof` | bytes32[32] | Smt proof
|`index` | uint32 | Index of the leaf
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root
|`originNetwork` | uint32 | Origin network
|`originAddress` | address | Origin address
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | message value
|`metadata` | bytes | Abi encoded metadata if any, empty otherwise

### precalculatedWrapperAddress
```solidity
  function precalculatedWrapperAddress(
    uint32 originNetwork,
    address originTokenAddress,
    string name,
    string symbol,
    uint8 decimals
  ) external returns (address)
```
Returns the precalculated address of a wrapper using the token information
Note Updating the metadata of a token is not supported.
Since the metadata has relevance in the address deployed, this function will not return a valid
wrapped address if the metadata provided is not the original one.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for ether
|`name` | string | Name of the token
|`symbol` | string | Symbol of the token
|`decimals` | uint8 | Decimals of the token

### getTokenWrappedAddress
```solidity
  function getTokenWrappedAddress(
    uint32 originNetwork,
    address originTokenAddress
  ) external returns (address)
```
Returns the address of a wrapper using the token information if already exist


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for ether

### activateEmergencyState
```solidity
  function activateEmergencyState(
  ) external
```
Function to activate the emergency state
     " Only can be called by the Polygon ZK-EVM in extreme situations



### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate the emergency state
     " Only can be called by the Polygon ZK-EVM



### _verifyLeaf
```solidity
  function _verifyLeaf(
    bytes32[32] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata,
    uint8 leafType
  ) internal
```
Verify leaf and checks that it has not been claimed


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`smtProof` | bytes32[32] | Smt proof
|`index` | uint32 | Index of the leaf
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root
|`originNetwork` | uint32 | Origin network
|`originAddress` | address | Origin address
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | Amount of tokens
|`metadata` | bytes | Abi encoded metadata if any, empty otherwise
|`leafType` | uint8 | Leaf type -->  [0] transfer Ether / ERC20 tokens, [1] message

### isClaimed
```solidity
  function isClaimed(
    uint256 index
  ) external returns (bool)
```
Function to check if an index is claimed or not


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`index` | uint256 | Index

### updateGlobalExitRoot
```solidity
  function updateGlobalExitRoot(
  ) external
```
Function to update the globalExitRoot if the last deposit is not submitted



### _updateGlobalExitRoot
```solidity
  function _updateGlobalExitRoot(
  ) internal
```
Function to update the globalExitRoot



### _permit
```solidity
  function _permit(
    address amount,
    uint256 permitData
  ) internal
```
Function to call token permit method of extended ERC20
     + @param token ERC20 token address


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | address | Quantity that is expected to be allowed
|`permitData` | uint256 | Raw data of the call `permit` of the token

### _safeSymbol
```solidity
  function _safeSymbol(
    address token
  ) internal returns (string)
```
Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | The address of the ERC-20 token contract

### _safeName
```solidity
  function _safeName(
    address token
  ) internal returns (string)
```
 Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | The address of the ERC-20 token contract.

### _safeDecimals
```solidity
  function _safeDecimals(
    address token
  ) internal returns (uint8)
```
Provides a safe ERC20.decimals version which returns '18' as fallback value.
Note Tokens with (decimals > 255) are not supported


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | The address of the ERC-20 token contract

### _returnDataToString
```solidity
  function _returnDataToString(
    bytes data
  ) internal returns (string)
```
Function to convert returned data to string
returns 'NOT_VALID_ENCODING' as fallback value.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`data` | bytes | returned data

## Events
### BridgeEvent
```solidity
  event BridgeEvent(
  )
```

Emitted when bridge assets or messages to another network

### ClaimEvent
```solidity
  event ClaimEvent(
  )
```

Emitted when a claim is done from another network

### NewWrappedToken
```solidity
  event NewWrappedToken(
  )
```

Emitted when a new wrapped token is created

