# AggOracleCommittee
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/sovereignChains/AggOracleCommittee.sol)

**Inherits:**
[IAggOracleCommittee](/contracts/interfaces/IAggOracleCommittee.sol/interface.IAggOracleCommittee.md), OwnableUpgradeable

**Title:**
AggOracleCommittee

Contract responsible for managing the insertion of GERs into the AgglayerGERL2.


## State Variables
### VERSION

```solidity
string public constant VERSION = "v1.0.0"
```


### INITIAL_PROPOSED_GER

```solidity
bytes32 public constant INITIAL_PROPOSED_GER = bytes32(uint256(1))
```


### globalExitRootManagerL2Sovereign
**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IAgglayerGERL2 public immutable globalExitRootManagerL2Sovereign
```


### aggOracleMembers

```solidity
address[] public aggOracleMembers
```


### quorum

```solidity
uint64 public quorum
```


### addressToLastProposedGER

```solidity
mapping(address => bytes32) public addressToLastProposedGER
```


### proposedGERToReport

```solidity
mapping(bytes32 => Report) public proposedGERToReport
```


## Functions
### constructor

Disables initializers on the implementation, following best practices.


```solidity
constructor(IAgglayerGERL2 globalExitRootManager) ;
```

### initialize

Initializes the contract.


```solidity
function initialize(address _owner, address[] calldata _aggOracleMembers, uint64 _quorum) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_owner`|`address`|Owner of the contract, presumably a timelock|
|`_aggOracleMembers`|`address[]`|Initial oracle members|
|`_quorum`|`uint64`|Quorum required for consolidation|


### proposeGlobalExitRoot

Propose a global exit root.
This function can only be called by an oracle member.
If the quorum is reached, the GER is consolidated.

In exceptional cases, GER could be removed using the removeGlobalExitRoots functionality.
This contract does not allow easily voting for a GER that was removed. However, in those exceptional cases,
the bridge will be paused and damages should be assessed. Once the bridge is unpaused,
oracles should naturally converge on a new GER.
Since new GERs contain previous GERs information, this behaviour is acceptable.
Therefore, the complexity added by allowing voting for a removed GER is not worth it.


```solidity
function proposeGlobalExitRoot(bytes32 proposedGlobalExitRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`proposedGlobalExitRoot`|`bytes32`|Global exit root proposed.|


### consolidateGlobalExitRoot

Consolidate a global exit root that has reached quorum.
This function it's meant to be called if the quorum was lowered, and there's a GER that has
enough votes to be consolidated after updating it. Otherwise the consolidation happens automatically.


```solidity
function consolidateGlobalExitRoot(bytes32 globalExitRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalExitRoot`|`bytes32`|Global exit root to consolidate|


### _consolidateGlobalExitRoot

Internal function to consolidate a global exit root.


```solidity
function _consolidateGlobalExitRoot(bytes32 globalExitRoot) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalExitRoot`|`bytes32`|Global exit root to consolidate|


### addOracleMember

Add an oracle member.
Only the owner can call this function.


```solidity
function addOracleMember(address newOracleMember) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOracleMember`|`address`|Address of the new oracle member|


### _addOracleMember

Internal function to add an oracle member.


```solidity
function _addOracleMember(address newOracleMember) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOracleMember`|`address`|Address of the new oracle member|


### removeOracleMember

Remove an oracle member.
Only the owner can call this function.


```solidity
function removeOracleMember(address oracleMemberAddress, uint256 oracleMemberIndex) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oracleMemberAddress`|`address`|Address of the oracle member to remove|
|`oracleMemberIndex`|`uint256`|Index of the oracle member to remove|


### updateQuorum

Update the quorum value.
Only the owner can call this function.
It is expected that the quorum and the oracle member will be updated atomically from a smart contract.


```solidity
function updateQuorum(uint64 newQuorum) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newQuorum`|`uint64`|New quorum value|


### transferGlobalExitRootUpdater

Transfer the globalExitRootUpdater role.
This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process.


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Accept the globalExitRootUpdater role.
This is the second step from a two-step process. Previously transferGlobalExitRootUpdater must have been called targeting this address.


```solidity
function acceptGlobalExitRootUpdater() external onlyOwner;
```

### getAggOracleMemberIndex

Returns the index of an oracle member.


```solidity
function getAggOracleMemberIndex(address oracleMember) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oracleMember`|`address`|Oracle member address|


### getAllAggOracleMembers

Returns all the oracle members.


```solidity
function getAllAggOracleMembers() external view returns (address[] memory);
```

### getAggOracleMembersCount

Returns the number of oracle members.


```solidity
function getAggOracleMembersCount() external view returns (uint256);
```

## Structs
### Report
Struct to store votes for GERs


```solidity
struct Report {
    uint64 votes;
    uint64 timestamp;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`votes`|`uint64`|Current number of votes for this report|
|`timestamp`|`uint64`|Timestamp when the report was first proposed|

