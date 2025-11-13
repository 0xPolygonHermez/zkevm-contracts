# IAggLayerGateway
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IAggLayerGateway.sol)

**Inherits:**
[IAggLayerGatewayEvents](/contracts/v2/interfaces/IAggLayerGateway.sol/interface.IAggLayerGatewayEvents.md), [IAggLayerGatewayErrors](/contracts/v2/interfaces/IAggLayerGateway.sol/interface.IAggLayerGatewayErrors.md)

This contract is the interface for the AggLayerGateway.

Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol


## Functions
### getDefaultAggchainVKey

returns the current aggchain verification key, used to verify chain's FEP.

*This function is necessary to query the map from an external function. In solidity maps are not
directly accessible from external functions like other state variables.*


```solidity
function getDefaultAggchainVKey(bytes4 defaultAggchainSelector) external view returns (bytes32);
```

### verifyPessimisticProof

Verifies a pessimistic proof with given public values and proof.

*It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
target verifier's VERIFIER_HASH.*


```solidity
function verifyPessimisticProof(bytes calldata publicValues, bytes calldata proofBytes) external view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`publicValues`|`bytes`|The public values encoded as bytes.|
|`proofBytes`|`bytes`|The proof of the program execution the SP1 zkVM encoded as bytes.|


### addPessimisticVKeyRoute

Adds a verifier route. This enable proofs to be routed to this verifier.

*Only callable by the owner. The owner is responsible for ensuring that the specified
verifier is correct with a valid VERIFIER_HASH. Once a route to a verifier is added, it
cannot be removed.*


```solidity
function addPessimisticVKeyRoute(bytes4 pessimisticVKeySelector, address verifier, bytes32 pessimisticVKey) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pessimisticVKeySelector`|`bytes4`|The verifier selector to add.|
|`verifier`|`address`|The address of the verifier contract. This verifier MUST implement the ISP1VerifierWithHash interface.|
|`pessimisticVKey`|`bytes32`|The verification key to be used for verifying pessimistic proofs.|


### freezePessimisticVKeyRoute

Freezes a verifier route. This prevents proofs from being routed to this verifier.

*Only callable by the owner. Once a route to a verifier is frozen, it cannot be
unfrozen.*


```solidity
function freezePessimisticVKeyRoute(bytes4 pessimisticVKeySelector) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pessimisticVKeySelector`|`bytes4`|The verifier selector to freeze.|


## Structs
### AggLayerVerifierRoute
Struct that defines a verifier route


```solidity
struct AggLayerVerifierRoute {
    address verifier;
    bytes32 pessimisticVKey;
    bool frozen;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`verifier`|`address`|The address of the verifier contract.|
|`pessimisticVKey`|`bytes32`|The verification key to be used for verifying pessimistic proofs.|
|`frozen`|`bool`|Whether the route is frozen.|

