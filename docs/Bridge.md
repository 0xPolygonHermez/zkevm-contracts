This is totally a mock contract, there's jsut enough to test the proof of efficiency contract


## Functions
### constructor
```solidity
  function constructor(
    address _rollupAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_rollupAddress` | address | Rollup contract address

### deposit
```solidity
  function deposit(
    contract IERC20 token,
    uint256 amount,
    uint32 destinationNetwork,
    address destinationAddress
  ) public
```
Deposit add a new leaf to the merkle tree


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | contract IERC20 | Token address, 0 address is reserved for ehter
|`amount` | uint256 | Amount of tokens
|`destinationNetwork` | uint32 | Network destination
|`destinationAddress` | address | Address destination

### withdraw
```solidity
  function withdraw(
    address token,
    uint256 amount,
    uint32 originalNetwork,
    uint32 destinationNetwork,
    address destinationAddress,
    bytes32[] smtProof,
    uint64 index,
    uint256 globalExitRootNum,
    bytes32 mainnetExitRoot,
    bytes32 rollupExitRoot
  ) public
```
Verify merkle proof and withdraw tokens/ether


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`token` | address |  Token address, 0 address is reserved for ehter
|`amount` | uint256 | Amount of tokens
|`originalNetwork` | uint32 | original network
|`destinationNetwork` | uint32 | Network destination, must be 0 ( mainnet)
|`destinationAddress` | address | Address destination
|`smtProof` | bytes32[] | Smt proof
|`index` | uint64 | Index of the leaf
|`globalExitRootNum` | uint256 | Global exit root num
|`mainnetExitRoot` | bytes32 | Mainnet exit root
|`rollupExitRoot` | bytes32 | Rollup exit root

### updateRollupExitRoot
```solidity
  function updateRollupExitRoot(
  ) public
```
Update the rollup exit root



### _updateGlobalExitRoot
```solidity
  function _updateGlobalExitRoot(
  ) internal
```
Update the global exit root using the mainnet and rollup exit root



### getLastGlobalExitRoot
```solidity
  function getLastGlobalExitRoot(
  ) public returns (bytes32)
```
Return last global exit root



## Events
### DepositEvent
```solidity
  event DepositEvent(
  )
```

Emitted when a deposit is added to the mainnet merkle tree

### WithdrawEvent
```solidity
  event WithdrawEvent(
  )
```

Emitted when a withdraw is done

### UpdateRollupRootEvent
```solidity
  event UpdateRollupRootEvent(
  )
```

Emitted when the rollup updates the exit root

