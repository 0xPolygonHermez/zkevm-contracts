# PolygonZkEVMDeployer
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/deployment/PolygonZkEVMDeployer.sol)

**Inherits:**
Ownable

Contract responsible for deploying deterministic address contracts related with the PolygonZkEVM


## Functions
### constructor


```solidity
constructor(address _owner) Ownable();
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_owner`|`address`|Owner|


### deployDeterministic

Allows to deploy a contract using create2


```solidity
function deployDeterministic(uint256 amount, bytes32 salt, bytes memory initBytecode) public payable onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Amount used in create2|
|`salt`|`bytes32`|Salt used in create2|
|`initBytecode`|`bytes`|Init bytecode that will be use in create2|


### deployDeterministicAndCall

Allows to deploy a contract using create2 and call it afterwards


```solidity
function deployDeterministicAndCall(uint256 amount, bytes32 salt, bytes memory initBytecode, bytes memory dataCall)
    public
    payable
    onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Amount used in create2|
|`salt`|`bytes32`|Salt used in create2|
|`initBytecode`|`bytes`|Init bytecode that will be use in create2|
|`dataCall`|`bytes`|Data used in the call after deploying the smart contract|


### functionCall


```solidity
function functionCall(address targetAddress, bytes memory dataCall, uint256 amount) public payable onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`targetAddress`|`address`|Amount of contract deploy|
|`dataCall`|`bytes`|Data used to call the target smart contract|
|`amount`|`uint256`|Data used to call the target smart contract|


### predictDeterministicAddress


```solidity
function predictDeterministicAddress(bytes32 salt, bytes32 bytecodeHash) public view returns (address);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`salt`|`bytes32`|Salt used in create2|
|`bytecodeHash`|`bytes32`|Init bytecode hashed, it contains the constructor parameters|


## Events
### NewDeterministicDeployment
*Emitted when a contract is deployed*


```solidity
event NewDeterministicDeployment(address newContractAddress);
```

### FunctionCall
*Emitted when a contract is called*


```solidity
event FunctionCall();
```

