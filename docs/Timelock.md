
Contract module which acts as a timelocked controller.
This gives time for users of the controlled contract to exit before a potentially dangerous maintenance operation is applied.

## Functions
### constructor
```solidity
  function constructor(
  ) public
```

Initializes the contract with the following parameters:

- `minDelay`: initial minimum delay for operations


### receive
```solidity
  function receive(
  ) external
```

Contract might receive/hold ETH


### isOperation
```solidity
  function isOperation(
  ) public returns (bool registered)
```

Returns whether an operation exists.This
includes Pending, Ready and Done operations.


### isOperationPending
```solidity
  function isOperationPending(
  ) public returns (bool pending)
```

Returns whether an operation is pending or not.


### isOperationReady
```solidity
  function isOperationReady(
  ) public returns (bool ready)
```

Returns whether an operation is ready or not.


### isOperationDone
```solidity
  function isOperationDone(
  ) public returns (bool done)
```

Returns whether an operation is done or not.


### getTimestamp
```solidity
  function getTimestamp(
  ) public returns (uint256 timestamp)
```

Returns the timestamp at with an operation becomes ready (0 for
unset operations, 1 for done operations).


### getMinDelay
```solidity
  function getMinDelay(
  ) public returns (uint256 duration)
```

Returns the minimum delay for an operation to become valid.

This value can be changed by executing an operation that calls `updateDelay`.
If proof of efficiency is on emergency state the minDelay will be 0 instead.


### hashOperation
```solidity
  function hashOperation(
  ) public returns (bytes32 hash)
```

Returns the identifier of an operation containing a single
transaction.


### hashOperationBatch
```solidity
  function hashOperationBatch(
  ) public returns (bytes32 hash)
```

Returns the identifier of an operation containing a batch of
transactions.


### schedule
```solidity
  function schedule(
  ) public
```

Schedule an operation containing a single transaction.

Emits a {CallScheduled} event.

Requirements:

- the caller must have the 'proposer' role.


### scheduleBatch
```solidity
  function scheduleBatch(
  ) public
```

Schedule an operation containing a batch of transactions.

Emits one {CallScheduled} event per transaction in the batch.

Requirements:

- the caller must have the 'proposer' role.


### cancel
```solidity
  function cancel(
  ) public
```

Cancel an operation.

Requirements:

- the caller must have the 'canceller' role.


### execute
```solidity
  function execute(
  ) public
```

Execute an (ready) operation containing a single transaction.

Emits a {CallExecuted} event.

Requirements:

- the caller must have the 'executor' role.


### executeBatch
```solidity
  function executeBatch(
  ) public
```

Execute an (ready) operation containing a batch of transactions.

Emits one {CallExecuted} event per transaction in the batch.

Requirements:

- the caller must have the 'executor' role.


### _execute
```solidity
  function _execute(
  ) internal
```

Execute an operation's call.


### updateDelay
```solidity
  function updateDelay(
  ) external
```

Changes the minimum timelock duration for future operations.

Emits a {MinDelayChange} event.

Requirements:

- the caller must be the timelock itself. This can only be achieved by scheduling and later executing
an operation where the timelock is the target and the data is the ABI-encoded call to this function.


## Events
### CallScheduled
```solidity
  event CallScheduled(
  )
```

Emitted when a call is scheduled as part of operation `id`.

### CallExecuted
```solidity
  event CallExecuted(
  )
```

Emitted when a call is performed as part of operation `id`.

### Cancelled
```solidity
  event Cancelled(
  )
```

Emitted when operation `id` is cancelled.

### MinDelayChange
```solidity
  event MinDelayChange(
  )
```

Emitted when the minimum delay for future operations is modified.

