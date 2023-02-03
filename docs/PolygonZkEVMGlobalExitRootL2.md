Contract responsible for managing the exit roots for the L2 and global exit roots
The special zkRom variables will be accessed and updated directly by the zkRom


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
|`_bridgeAddress` | address | PolygonZkEVMBridge contract address

### updateExitRoot
```solidity
  function updateExitRoot(
    bytes32 newRoot
  ) external
```
Update the exit root of one of the networks and the global exit root


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newRoot` | bytes32 | new exit tree root

