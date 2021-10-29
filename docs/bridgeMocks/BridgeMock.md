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
  ) public
```




### updateRollupExitRoot
```solidity
  function updateRollupExitRoot(
  ) public
```




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



