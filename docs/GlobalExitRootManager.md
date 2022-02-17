Contract responsible for managing the exit roots across multiple networks


## Functions
### constructor
```solidity
  function constructor(
    address _rollupAddress,
    address _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_rollupAddress` | address | Rollup contract address
|`_bridgeAddress` | address | Bridge contract address

### updateExitRoot
```solidity
  function updateExitRoot(
  ) external
```
Update the exit root of one of the networks and the global exit root



### getLastGlobalExitRoot
```solidity
  function getLastGlobalExitRoot(
  ) public returns (bytes32)
```
Return last global exit root



## Events
### UpdateGlobalExitRoot
```solidity
  event UpdateGlobalExitRoot(
  )
```

Emitted when the the global exit root is updated

