Contract responsible for managing the exit roots across multiple networks


## Functions
### initialize
```solidity
  function initialize(
  ) external
```




### addNewConsensus
```solidity
  function addNewConsensus(
    address newConsensusAddress
  ) external
```
Add a new consensus contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newConsensusAddress` | address | new exit tree root

### addNewVerifier
```solidity
  function addNewVerifier(
    address newVerifierAddress
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifierAddress` | address | new verifier address

### createNewNetwork
```solidity
  function createNewNetwork(
    address newVerifierAddress
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifierAddress` | address | new verifier address

### calculateCurrentRollupRoot
```solidity
  function calculateCurrentRollupRoot(
    address newVerifierAddress
  ) external
```
Add a new vefifier contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newVerifierAddress` | address | new verifier address

## Events
### AddNewConsensus
```solidity
  event AddNewConsensus(
  )
```

Emitted when a new consensus is added

### AddNewVerifier
```solidity
  event AddNewVerifier(
  )
```

Emitted when a new verifier is added

