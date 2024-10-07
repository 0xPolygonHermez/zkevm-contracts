Contract responsible for managing the states and the updates of L2 network.
There will be a trusted sequencer, which is able to send transactions.
Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridgeV2 _bridgeAddress,
    contract PolygonRollupManager _rollupManager
  ) internal
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRootV2 | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridgeV2 | Bridge address
|`_rollupManager` | contract PolygonRollupManager | Global exit root manager address

### initialize
```solidity
  function initialize(
    address _admin,
    address sequencer,
    uint32 _gasTokenAddress,
    address sequencerURL,
    string _networkName
  ) external
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_admin` | address | Admin address
|`sequencer` | address | Trusted sequencer address
|`_gasTokenAddress` | uint32 | Indicates the token address in mainnet that will be used as a gas token
Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
|`sequencerURL` | address | Trusted sequencer URL
|`_networkName` | string | L2 network name

### setTrustedSequencer
```solidity
  function setTrustedSequencer(
    address newTrustedSequencer
  ) external
```
Allow the admin to set a new trusted sequencer


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencer` | address | Address of the new trusted sequencer

### setTrustedSequencerURL
```solidity
  function setTrustedSequencerURL(
    string newTrustedSequencerURL
  ) external
```
Allow the admin to set the trusted sequencer URL


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newTrustedSequencerURL` | string | URL of trusted sequencer

### transferAdminRole
```solidity
  function transferAdminRole(
    address newPendingAdmin
  ) external
```
Starts the admin role transfer
This is a two step process, the pending admin must accepted to finalize the process


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newPendingAdmin` | address | Address of the new pending admin

### acceptAdminRole
```solidity
  function acceptAdminRole(
  ) external
```
Allow the current pending admin to accept the admin role



## Events
### SetTrustedSequencer
```solidity
  event SetTrustedSequencer(
  )
```

Emitted when the admin updates the trusted sequencer address

### SetTrustedSequencerURL
```solidity
  event SetTrustedSequencerURL(
  )
```

Emitted when the admin updates the sequencer URL

### TransferAdminRole
```solidity
  event TransferAdminRole(
  )
```

Emitted when the admin starts the two-step transfer role setting a new pending admin

### AcceptAdminRole
```solidity
  event AcceptAdminRole(
  )
```

Emitted when the pending admin accepts the admin role

