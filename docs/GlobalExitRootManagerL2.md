Contract responsible for managing the exit roots for the L2 and global exit roots
The special circuit variables will be accesed and updated directly by the circuit


## Functions
### constructor
```solidity
  function constructor(
    address _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
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



