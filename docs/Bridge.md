Bridge that will be deployed on both networks Ethereum and Polygon zkEVM
Contract responsible to manage the token interactions with other networks


## Functions
### initialize
```solidity
  function initialize(
    uint32 _networkID,
    contract IGlobalExitRootManager _globalExitRootManager
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_networkID` | uint32 | networkID
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address

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
  ) public
```
Bridge message


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`metadata` | bytes | Message metadata

### claimAsset
```solidity
  function claimAsset(
    bytes32[] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
  ) public
```
Verify merkle proof and withdraw tokens/ether


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`smtProof` | bytes32[] | Smt proof
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
    bytes32[] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot,
    uint32 originNetwork,
    address originAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes metadata
  ) public
```
Verify merkle proof and execute message


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`smtProof` | bytes32[] | Smt proof
|`index` | uint32 | Index of the leaf
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root
|`originNetwork` | uint32 | Origin network
|`originAddress` | address | Origin address
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination
|`amount` | uint256 | Amount of tokens
|`metadata` | bytes | Abi encoded metadata if any, empty otherwise

### precalculatedWrapperAddress
```solidity
  function precalculatedWrapperAddress(
    uint32 originNetwork,
    address originTokenAddress
  ) public returns (address)
```
Returns the precalculated address of a wrapper using the token information


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for ether

### getTokenWrappedAddress
```solidity
  function getTokenWrappedAddress(
    uint32 originNetwork,
    address originTokenAddress
  ) public returns (address)
```
Returns the address of a wrapper using the token information if already exist


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for ether

### pause
```solidity
  function pause(
  ) external
```
Function to pause the contract
     " Can only be called by the proof of efficiency in extreme situations



### unpause
```solidity
  function unpause(
  ) external
```
Function to unpause the contract
     " Can only be called by the proof of efficiency



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

Emitted when a bridge some tokens to another network

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

Emitted when a a new wrapped token is created

