# IAggOracleCommittee
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IAggOracleCommittee.sol)

**Title:**
IAggOracleCommittee

Interface for the AggOracleCommittee contract responsible for managing the insertion of GERs into the AgglayerGERL2.


## Functions
### initialize

Initializes the contract.


```solidity
function initialize(address _owner, address[] calldata _aggOracleMembers, uint64 _quorum) external;
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


```solidity
function proposeGlobalExitRoot(bytes32 proposedGlobalExitRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`proposedGlobalExitRoot`|`bytes32`|Global exit root proposed|


### consolidateGlobalExitRoot

Consolidate a global exit root that has reached quorum.
This function it's meant to be called if the quorum was lowered, and there's a GER that has
enough votes to be consolidated after updating it.


```solidity
function consolidateGlobalExitRoot(bytes32 globalExitRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`globalExitRoot`|`bytes32`|Global exit root to consolidate|


### addOracleMember

Add an oracle member.
Only the owner can call this function.


```solidity
function addOracleMember(address newOracleMember) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOracleMember`|`address`|Address of the new oracle member|


### removeOracleMember

Remove an oracle member.
Only the owner can call this function.


```solidity
function removeOracleMember(address oracleMemberAddress, uint256 oracleMemberIndex) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oracleMemberAddress`|`address`|Address of the oracle member to remove|
|`oracleMemberIndex`|`uint256`|Index of the oracle member to remove|


### updateQuorum

Update the quorum value.
Only the owner can call this function.


```solidity
function updateQuorum(uint64 newQuorum) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newQuorum`|`uint64`|New quorum value|


### transferGlobalExitRootUpdater

Transfer the globalExitRootUpdater role.
This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process.


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Accept the globalExitRootUpdater role.


```solidity
function acceptGlobalExitRootUpdater() external;
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

### INITIAL_PROPOSED_GER

This value is reserved as an initial voted GER to mark an oracle address as active


```solidity
function INITIAL_PROPOSED_GER() external view returns (bytes32);
```

### globalExitRootManagerL2Sovereign

Global exit root manager L2


```solidity
function globalExitRootManagerL2Sovereign() external view returns (IAgglayerGERL2);
```

### aggOracleMembers

Array of oracle members


```solidity
function aggOracleMembers(uint256 index) external view returns (address);
```

### quorum

Number of reports that must match to consolidate a new rewards root (N/M)


```solidity
function quorum() external view returns (uint64);
```

### addressToLastProposedGER

Oracle member address --> current voted GER


```solidity
function addressToLastProposedGER(address oracleMember) external view returns (bytes32);
```

## Events
### ProposedGlobalExitRoot
Emitted when a global exit root is proposed


```solidity
event ProposedGlobalExitRoot(bytes32 proposedGlobalExitRoot, address proposer);
```

### ConsolidatedGlobalExitRoot
Emitted when a global exit root is consolidated


```solidity
event ConsolidatedGlobalExitRoot(bytes32 consolidatedGlobalExitRoot);
```

### UpdateQuorum
Emitted when the quorum is updated


```solidity
event UpdateQuorum(uint64 newQuorum);
```

### AddAggOracleMember
Emitted when a new oracle member is added


```solidity
event AddAggOracleMember(address newOracleMember);
```

### RemoveAggOracleMember
Emitted when an oracle member is removed


```solidity
event RemoveAggOracleMember(address oracleMemberRemoved);
```

## Errors
### QuorumCannotBeZero
Thrown when the quorum value is zero.


```solidity
error QuorumCannotBeZero();
```

### NotOracleMember
Thrown when the caller is not an oracle member.


```solidity
error NotOracleMember();
```

### AlreadyOracleMember
Thrown when the address is already an oracle member.


```solidity
error AlreadyOracleMember();
```

### OracleMemberIndexMismatch
Thrown when the provided oracle member index does not match the address.


```solidity
error OracleMemberIndexMismatch();
```

### WasNotOracleMember
Thrown when the address was not an oracle member.


```solidity
error WasNotOracleMember();
```

### OracleMemberNotFound
Thrown when the oracle member is not found.


```solidity
error OracleMemberNotFound();
```

### InvalidProposedGER
Thrown when the proposed GER is invalid (zero or reserved value).


```solidity
error InvalidProposedGER();
```

### OracleMemberCannotBeZero
Thrown when the oracle member address is the zero address.


```solidity
error OracleMemberCannotBeZero();
```

### AlreadyVotedForThisGER
Thrown when the oracle member has already voted for the proposed GER.


```solidity
error AlreadyVotedForThisGER();
```

### QuorumNotReached
Thrown when the quorum has not been reached for a global exit root.


```solidity
error QuorumNotReached();
```

### GlobalExitRootManagerCannotBeZero
Thrown when the global exit root manager address is the zero address.


```solidity
error GlobalExitRootManagerCannotBeZero();
```

### QuorumCannotBeGreaterThanAggOracleMembers
Thrown when the quorum is greater than the number of oracle members.


```solidity
error QuorumCannotBeGreaterThanAggOracleMembers();
```

### OracleMemberIndexOutOfBounds
Thrown when the oracle member index is out of bounds.


```solidity
error OracleMemberIndexOutOfBounds();
```

