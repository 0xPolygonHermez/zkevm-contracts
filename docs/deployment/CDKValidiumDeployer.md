Contract responsible for deploying deterministic address contracts related with the CDKValidium


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

### deployDeterministic
```solidity
  function deployDeterministic(
    uint256 amount,
    bytes32 salt,
    bytes initBytecode
  ) public
```
Allows to deploy a contract using create2


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | uint256 | Amount used in create2
|`salt` | bytes32 | Salt used in create2
|`initBytecode` | bytes | Init bytecode that will be use in create2

### deployDeterministicAndCall
```solidity
  function deployDeterministicAndCall(
    uint256 amount,
    bytes32 salt,
    bytes initBytecode,
    bytes dataCall
  ) public
```
Allows to deploy a contract using create2 and call it afterwards


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | uint256 | Amount used in create2
|`salt` | bytes32 | Salt used in create2
|`initBytecode` | bytes | Init bytecode that will be use in create2
|`dataCall` | bytes | Data used in the call after deploying the smart contract

### functionCall
```solidity
  function functionCall(
    address targetAddress,
    bytes dataCall,
    uint256 amount
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`targetAddress` | address | Amount of contract deploy
|`dataCall` | bytes | Data used to call the target smart contract
|`amount` | uint256 | Data used to call the target smart contract

### predictDeterministicAddress
```solidity
  function predictDeterministicAddress(
    bytes32 salt,
    bytes32 bytecodeHash
  ) public returns (address)
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`salt` | bytes32 | Salt used in create2
|`bytecodeHash` | bytes32 | Init bytecode hashed, it contains the constructor parameters

## Events
### NewDeterministicDeployment
```solidity
  event NewDeterministicDeployment(
  )
```

Emitted when a contract is deployed

### FunctionCall
```solidity
  event FunctionCall(
  )
```

Emitted when a contract is called

