Contract responsible for deploying deterministic address contracts related with the PolygonZkEVM


## Functions
### constructor
```solidity
  function constructor(
    address _owner
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_owner` | address | Owner

### deploy
```solidity
  function deploy(
    uint256 amount,
    bytes32 salt,
    bytes initBytecode
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | uint256 | Amount of contract deploy
|`salt` | bytes32 | salt used in create2
|`initBytecode` | bytes | init bytecode that will be use din create2

### deployAndCall
```solidity
  function deployAndCall(
    uint256 amount,
    bytes32 salt,
    bytes initBytecode,
    bytes dataCall
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | uint256 | Amount of contract deploy
|`salt` | bytes32 | salt used in create2
|`initBytecode` | bytes | init bytecode that will be use din create2
|`dataCall` | bytes | data used in the call after deploying the smart contract

### call
```solidity
  function call(
    address targetAddress,
    bytes dataCall
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targetAddress` | address | Amount of contract deploy
|`dataCall` | bytes | Data used to call the target smart contract

## Events
### NewDeployment
```solidity
  event NewDeployment(
  )
```

Emitted when a contract is deployed

### Call
```solidity
  event Call(
  )
```

Emitted when a contract is called

