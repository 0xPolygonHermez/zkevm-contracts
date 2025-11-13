# PolygonConsensusBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/lib/PolygonConsensusBase.sol)

**Inherits:**
Initializable, [IPolygonConsensusBase](/contracts/v2/interfaces/IPolygonConsensusBase.sol/interface.IPolygonConsensusBase.md), [IPolygonZkEVMEtrogErrors](/contracts/v2/interfaces/IPolygonZkEVMEtrogErrors.sol/interface.IPolygonZkEVMEtrogErrors.md)

Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## State Variables
### pol

```solidity
IERC20Upgradeable public immutable pol;
```


### globalExitRootManager

```solidity
IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;
```


### bridgeAddress

```solidity
IPolygonZkEVMBridgeV2 public immutable bridgeAddress;
```


### rollupManager

```solidity
PolygonRollupManager public immutable rollupManager;
```


### admin

```solidity
address public admin;
```


### pendingAdmin

```solidity
address public pendingAdmin;
```


### trustedSequencer

```solidity
address public trustedSequencer;
```


### trustedSequencerURL

```solidity
string public trustedSequencerURL;
```


### networkName

```solidity
string public networkName;
```


### lastAccInputHash

```solidity
bytes32 public lastAccInputHash;
```


### forcedBatches

```solidity
mapping(uint64 => bytes32) public forcedBatches;
```


### lastForceBatch

```solidity
uint64 public lastForceBatch;
```


### lastForceBatchSequenced

```solidity
uint64 public lastForceBatchSequenced;
```


### forceBatchTimeout

```solidity
uint64 public forceBatchTimeout;
```


### forceBatchAddress

```solidity
address public forceBatchAddress;
```


### gasTokenAddress

```solidity
address public gasTokenAddress;
```


### gasTokenNetwork

```solidity
uint32 public gasTokenNetwork;
```


### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.*

**Note:**
oz-renamed-from: _gap


```solidity
uint256[50] private __gap;
```


## Functions
### constructor


```solidity
constructor(
    IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    IERC20Upgradeable _pol,
    IPolygonZkEVMBridgeV2 _bridgeAddress,
    PolygonRollupManager _rollupManager
);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRootManager`|`IPolygonZkEVMGlobalExitRootV2`|Global exit root manager address|
|`_pol`|`IERC20Upgradeable`|POL token address|
|`_bridgeAddress`|`IPolygonZkEVMBridgeV2`|Bridge address|
|`_rollupManager`|`PolygonRollupManager`|Global exit root manager address|


### initialize


```solidity
function initialize(
    address _admin,
    address sequencer,
    uint32,
    address _gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName
) external virtual onlyRollupManager initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`sequencer`|`address`|Trusted sequencer address|
|`<none>`|`uint32`||
|`_gasTokenAddress`|`address`|Indicates the token address in mainnet that will be used as a gas token Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead|
|`sequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|


### _initializePolygonConsensusBase


```solidity
function _initializePolygonConsensusBase(
    address _admin,
    address sequencer,
    address _gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_admin`|`address`|Admin address|
|`sequencer`|`address`|Trusted sequencer address|
|`_gasTokenAddress`|`address`|Indicates the token address in mainnet that will be used as a gas token Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead|
|`sequencerURL`|`string`|Trusted sequencer URL|
|`_networkName`|`string`|L2 network name|


### onlyAdmin


```solidity
modifier onlyAdmin();
```

### onlyRollupManager


```solidity
modifier onlyRollupManager();
```

### setTrustedSequencer

Allow the admin to set a new trusted sequencer


```solidity
function setTrustedSequencer(address newTrustedSequencer) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedSequencer`|`address`|Address of the new trusted sequencer|


### setTrustedSequencerURL

Allow the admin to set the trusted sequencer URL


```solidity
function setTrustedSequencerURL(string memory newTrustedSequencerURL) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newTrustedSequencerURL`|`string`|URL of trusted sequencer|


### transferAdminRole

Starts the admin role transfer
This is a two step process, the pending admin must accepted to finalize the process


```solidity
function transferAdminRole(address newPendingAdmin) external onlyAdmin;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newPendingAdmin`|`address`|Address of the new pending admin|


### acceptAdminRole

Allow the current pending admin to accept the admin role


```solidity
function acceptAdminRole() external;
```

## Events
### SetTrustedSequencer
*Emitted when the admin updates the trusted sequencer address*


```solidity
event SetTrustedSequencer(address newTrustedSequencer);
```

### SetTrustedSequencerURL
*Emitted when the admin updates the sequencer URL*


```solidity
event SetTrustedSequencerURL(string newTrustedSequencerURL);
```

### TransferAdminRole
*Emitted when the admin starts the two-step transfer role setting a new pending admin*


```solidity
event TransferAdminRole(address newPendingAdmin);
```

### AcceptAdminRole
*Emitted when the pending admin accepts the admin role*


```solidity
event AcceptAdminRole(address newAdmin);
```

