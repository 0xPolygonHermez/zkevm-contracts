This is totally a mock contract, there's just enough to test the proof of efficiency contract


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
  ) internal
```
Update the exit root of one of the networks and the globalExitRoot



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

