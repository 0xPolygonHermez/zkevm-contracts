# AggchainECDSAMultisig
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/aggchains/AggchainECDSAMultisig.sol)

**Inherits:**
[AggchainBase](/contracts/lib/AggchainBase.sol/abstract.AggchainBase.md)

**Title:**
AggchainECDSAMultisig

Generic aggchain based on ECDSA multisig signature.
An array of addresses signs the new_ler and the commit_imported_bridge_exits in order to do state
transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
The addresses and threshold are managed by the aggchainManager.


## State Variables
### _initializerVersion

```solidity
uint8 private transient _initializerVersion
```


### AGGCHAIN_TYPE

```solidity
bytes2 public constant AGGCHAIN_TYPE = 0x0000
```


### AGGCHAIN_ECDSA_MULTISIG_VERSION
Aggchain version


```solidity
string public constant AGGCHAIN_ECDSA_MULTISIG_VERSION = "v1.0.0"
```


## Functions
### getInitializedVersion

Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.


```solidity
modifier getInitializedVersion() ;
```

### constructor


```solidity
constructor(
    IAgglayerGER _globalExitRootManager,
    IERC20Upgradeable _pol,
    IAgglayerBridge _bridgeAddress,
    AgglayerManager _rollupManager,
    IAgglayerGateway _aggLayerGateway
) AggchainBase(_globalExitRootManager, _pol, _bridgeAddress, _rollupManager, _aggLayerGateway);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IAgglayerGER`|Global exit root manager address.|
|`_pol`|`IERC20Upgradeable`|POL token contract address.|
|`_bridgeAddress`|`IAgglayerBridge`|Bridge contract address.|
|`_rollupManager`|`AgglayerManager`|Rollup manager contract address.|
|`_aggLayerGateway`|`IAgglayerGateway`|AgglayerGateway contract address.|


### initialize

Initialize the AggchainECDSAMultisig contract

The reinitializer(2) is set to support the upgrade from PolygonPessimisticConsensus to AggchainECDSAMultisig, where PolygonPessimisticConsensus is already initialized

**Note:**
security: First initialization takes into account this contracts and all the inheritance contracts
This function can only be called when the contract is first deployed (version 0)


```solidity
function initialize(
    address _admin,
    address _trustedSequencer,
    address _gasTokenAddress,
    string memory _trustedSequencerURL,
    string memory _networkName,
    bool _useDefaultSigners,
    SignerInfo[] memory _signersToAdd,
    uint256 _newThreshold
) external onlyAggchainManager getInitializedVersion reinitializer(2);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`_trustedSequencer`|`address`|Trusted sequencer address|
|`_gasTokenAddress`|`address`|Gas token address|
|`_trustedSequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|Network name|
|`_useDefaultSigners`|`bool`|Whether to use default signers from gateway|
|`_signersToAdd`|`SignerInfo[]`|Array of signers to add|
|`_newThreshold`|`uint256`|New threshold for multisig operations|


### migrateFromLegacyConsensus

Migrates from PolygonPessimisticConsensus or PolygonRollupBaseEtrog to AggchainECDSAMultisig

This function is called when upgrading from a PolygonPessimisticConsensus contract.
- Therefore the consensusBase is already initialized.
- The AggchainBase is initialized using the values from the ConsensusBase.
It sets up the initial multisig configuration using the existing admin and trustedSequencer,
Sets the threshold to 1, and adds the trustedSequencer as the only signer.


```solidity
function migrateFromLegacyConsensus() external onlyRollupManager getInitializedVersion reinitializer(2);
```

### getVKeyAndAggchainParams

Validates the provided aggchain data and returns the computed aggchain parameters and vkey

For ECDSA multisig, no data is needed as verification is done through signatures


```solidity
function getVKeyAndAggchainParams(bytes memory aggchainData) public pure override returns (bytes32, bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|custom bytes provided by the chain, encoded in ABI solidity format aggchain_vkey: set to zero to skip verification in the PP aggchain_params: set to zero to skip verification in the PP|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|aggchainVKey Always returns bytes32(0) as ECDSA doesn't use verification keys|
|`<none>`|`bytes32`|aggchainParams Always returns bytes32(0) as ECDSA doesn't use verification|


### version

Function to retrieve the current version of the contract.


```solidity
function version() external pure returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|version String representation of the contract version|


### onVerifyPessimistic

Callback when pessimistic proof is verified

For ECDSA multisig, just validates empty data and emits event


```solidity
function onVerifyPessimistic(bytes calldata aggchainData) external onlyRollupManager;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`aggchainData`|`bytes`|Must be empty for ECDSA implementation|


### enableUseDefaultVkeysFlag

This function is not supported in ECDSA multisig implementation

Overridden to prevent usage as ECDSA doesn't use verification keys

**Note:**
security: Always reverts with FunctionNotSupported error


```solidity
function enableUseDefaultVkeysFlag() external view override onlyAggchainManager;
```

### disableUseDefaultVkeysFlag

This function is not supported in ECDSA multisig implementation

Overridden to prevent usage as ECDSA doesn't use verification keys

**Note:**
security: Always reverts with FunctionNotSupported error


```solidity
function disableUseDefaultVkeysFlag() external view override onlyAggchainManager;
```

### addOwnedAggchainVKey

This function is not supported in ECDSA multisig implementation

Overridden to prevent usage as ECDSA doesn't use verification keys

**Note:**
security: Always reverts with FunctionNotSupported error


```solidity
function addOwnedAggchainVKey(bytes4, bytes32) external view override onlyAggchainManager;
```

### updateOwnedAggchainVKey

This function is not supported in ECDSA multisig implementation

Overridden to prevent usage as ECDSA doesn't use verification keys

**Note:**
security: Always reverts with FunctionNotSupported error


```solidity
function updateOwnedAggchainVKey(bytes4, bytes32) external view override onlyAggchainManager;
```

### getAggchainVKey

Returns the aggchain verification key - always returns zero in ECDSA multisig

Overridden to return bytes32(0) since verification keys are not used in ECDSA multisig


```solidity
function getAggchainVKey(bytes4) public pure override returns (bytes32 aggchainVKey);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`aggchainVKey`|`bytes32`|Always returns bytes32(0) as ECDSA doesn't use verification keys|


## Events
### OnVerifyPessimisticECDSAMultisig
Emitted when pessimistic verification is completed.


```solidity
event OnVerifyPessimisticECDSAMultisig();
```

## Errors
### InvalidInitializer
Thrown when trying to initialize the wrong initialize function.


```solidity
error InvalidInitializer();
```

### FunctionNotSupported
Thrown when calling a function that is not supported by this implementation.


```solidity
error FunctionNotSupported();
```

