Bridge that will be deployed on both networks Ethereum and Polygon Hermez
Contract responsible to manage the token interactions with other networks


## Functions
### constructor
```solidity
  function constructor(
    uint32 _networkID,
    contract IGlobalExitRootManager _globalExitRootManager
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_networkID` | uint32 | networkID
|`_globalExitRootManager` | contract IGlobalExitRootManager | global exit root manager address

### bridge
```solidity
  function bridge(
    address token,
    uint256 amount,
    uint32 destinationNetwork,
    address destinationAddress
  ) public
```
Deposit add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address | Token address, 0 address is reserved for ether
|`amount` | uint256 | Amount of tokens
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination

### claim
```solidity
  function claim(
    address originalTokenAddress,
    uint256 amount,
    uint32 originalNetwork,
    uint32 destinationNetwork,
    address destinationAddress,
    bytes32[] smtProof,
    uint32 index,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot
  ) public
```
Verify merkle proof and withdraw tokens/ether


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originalTokenAddress` | address |  Original token address, 0 address is reserved for ether
|`amount` | uint256 | Amount of tokens
|`originalNetwork` | uint32 | Original network
|`destinationNetwork` | uint32 | Network destination, must be 0 ( mainnet)
|`destinationAddress` | address | Address destination
|`smtProof` | bytes32[] | Smt proof
|`index` | uint32 | Index of the leaf
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root

### precalculatedWrapperAddress
```solidity
  function precalculatedWrapperAddress(
    uint32 originalNetwork,
    address originalTokenAddress
  ) public returns (address)
```
Returns the precalculated address of a wrapper using the token information


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originalNetwork` | uint32 | Original network
|`originalTokenAddress` | address | Original token address, 0 address is reserved for ether

### getTokenWrappedAddress
```solidity
  function getTokenWrappedAddress(
    uint32 originalNetwork,
    address originalTokenAddress
  ) public returns (address)
```
Returns the address of a wrapper using the token information if already exist


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originalNetwork` | uint32 | Original network
|`originalTokenAddress` | address | Original token address, 0 address is reserved for ether

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

