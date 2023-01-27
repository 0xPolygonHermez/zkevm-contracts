PolygonZkEVMBridge that will be deployed on both networks Ethereum and Polygon zkEVM
Contract responsible to manage the token interactions with other networks


## Functions
### initialize
```solidity
  function initialize(
    uint32 _networkID,
    contract IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonZkEVMaddress
  ) external
```
The value of `_polygonZkEVMaddress` on the L2 deployment of the contract will be address(0), so 
emergency state is not possible for the L2 deployment of the bridge, intentionally

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_networkID` | uint32 | networkID
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRoot | global exit root manager address
|`_polygonZkEVMaddress` | address | polygonZkEVM address


### bridgeAsset
```solidity
  function bridgeAsset(
    address token,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes permitData
  ) public
```
Deposit add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | Token address, 0 address is reserved for ether
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | Amount of tokens
|`permitData` | bytes | Raw data of the call `permit` of the token

### bridgeMessage
```solidity
  function bridgeMessage(
    uint32 destinationNetwork,
    address destinationAddress,
    bytes metadata
  ) external
```
Bridge message and send ETH value


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
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

