// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ProofOfEfficiency.sol";

// Based on: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/TimelockController.sol

/*
 * changelog:
 *   - Update to solidity 0.8.15
 *   - Remove predecessors everywhere
 *   - Remove rols -->  Replaced by owner
 *   - Remove IERC165-supportsInterface
 *   - Remove IERC721/IERC1155 Receivers
 *   - Rename payload --> data
 *   - Update getMinDelay logic: if the zkEVM contracts are on emergency mode, delay is 0
 */

/**
 * @dev Contract module which acts as a timelocked controller.
 * This gives time for users of the controlled contract to exit before a potentially dangerous maintenance operation is applied.
 */
contract Timelock is Ownable {
    uint256 internal constant _DONE_TIMESTAMP = uint256(1);

    mapping(bytes32 => uint256) private _timestamps;
    uint256 private _minDelay;

    ProofOfEfficiency public proofOfEfficiency;

    /**
     * @dev Emitted when a call is scheduled as part of operation `id`.
     */
    event CallScheduled(
        bytes32 indexed id,
        uint256 indexed index,
        address target,
        uint256 value,
        bytes data,
        uint256 delay
    );

    /**
     * @dev Emitted when a call is performed as part of operation `id`.
     */
    event CallExecuted(
        bytes32 indexed id,
        uint256 indexed index,
        address target,
        uint256 value,
        bytes data
    );

    /**
     * @dev Emitted when operation `id` is cancelled.
     */
    event Cancelled(bytes32 indexed id);

    /**
     * @dev Emitted when the minimum delay for future operations is modified.
     */
    event MinDelayChange(uint256 oldDuration, uint256 newDuration);

    /**
     * @dev Initializes the contract with the following parameters:
     *
     * - `minDelay`: initial minimum delay for operations
     */
    constructor(uint256 minDelay, ProofOfEfficiency _proofOfEfficiency) {
        proofOfEfficiency = _proofOfEfficiency;
        _minDelay = minDelay;
        emit MinDelayChange(0, minDelay);
    }

    /**
     * @dev Contract might receive/hold ETH
     */
    receive() external payable {}

    /**
     * @dev Returns whether an operation exists.This
     * includes Pending, Ready and Done operations.
     */
    function isOperation(bytes32 id) public view returns (bool registered) {
        return getTimestamp(id) > 0;
    }

    /**
     * @dev Returns whether an operation is pending or not.
     */
    function isOperationPending(bytes32 id) public view returns (bool pending) {
        return getTimestamp(id) > _DONE_TIMESTAMP;
    }

    /**
     * @dev Returns whether an operation is ready or not.
     */
    function isOperationReady(bytes32 id) public view returns (bool ready) {
        uint256 timestamp = getTimestamp(id);
        return timestamp > _DONE_TIMESTAMP && timestamp <= block.timestamp;
    }

    /**
     * @dev Returns whether an operation is done or not.
     */
    function isOperationDone(bytes32 id) public view returns (bool done) {
        return getTimestamp(id) == _DONE_TIMESTAMP;
    }

    /**
     * @dev Returns the timestamp at with an operation becomes ready (0 for
     * unset operations, 1 for done operations).
     */
    function getTimestamp(bytes32 id) public view returns (uint256 timestamp) {
        return _timestamps[id];
    }

    /**
     * @dev Returns the minimum delay for an operation to become valid.
     *
     * This value can be changed by executing an operation that calls `updateDelay`.
     * If proof of efficiency is on emergency state the minDelay will be 0 instead.
     */
    function getMinDelay() public view returns (uint256 duration) {
        if (proofOfEfficiency.isEmergencyState()) {
            return 0;
        } else {
            return _minDelay;
        }
    }

    /**
     * @dev Returns the identifier of an operation containing a single
     * transaction.
     */
    function hashOperation(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) public pure returns (bytes32 hash) {
        return keccak256(abi.encode(target, value, data, salt));
    }

    /**
     * @dev Returns the identifier of an operation containing a batch of
     * transactions.
     */
    function hashOperationBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        bytes32 salt
    ) public pure returns (bytes32 hash) {
        return keccak256(abi.encode(targets, values, datas, salt));
    }

    /**
     * @dev Schedule an operation containing a single transaction.
     *
     * Emits a {CallScheduled} event.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt,
        uint256 delay
    ) public onlyOwner {
        bytes32 id = hashOperation(target, value, data, salt);
        _schedule(id, delay);
        emit CallScheduled(id, 0, target, value, data, delay);
    }

    /**
     * @dev Schedule an operation containing a batch of transactions.
     *
     * Emits one {CallScheduled} event per transaction in the batch.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        bytes32 salt,
        uint256 delay
    ) public onlyOwner {
        require(
            targets.length == values.length,
            "TimelockController: length mismatch"
        );
        require(
            targets.length == datas.length,
            "TimelockController: length mismatch"
        );

        bytes32 id = hashOperationBatch(targets, values, datas, salt);
        _schedule(id, delay);
        for (uint256 i = 0; i < targets.length; ++i) {
            emit CallScheduled(id, i, targets[i], values[i], datas[i], delay);
        }
    }

    /**
     * @dev Schedule an operation that is to becomes valid after a given delay.
     */
    function _schedule(bytes32 id, uint256 delay) private {
        require(
            !isOperation(id),
            "TimelockController: operation already scheduled"
        );
        require(
            delay >= getMinDelay(),
            "TimelockController: insufficient delay"
        );
        _timestamps[id] = block.timestamp + delay;
    }

    /**
     * @dev Cancel an operation.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function cancel(bytes32 id) public onlyOwner {
        require(
            isOperationPending(id),
            "TimelockController: operation cannot be cancelled"
        );
        delete _timestamps[id];

        emit Cancelled(id);
    }

    /**
     * @dev Execute an (ready) operation containing a single transaction.
     *
     * Emits a {CallExecuted} event.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    // This function can reenter, but it doesn't pose a risk because _afterCall checks that the proposal is pending,
    // thus any modifications to the operation during reentrancy should be caught.
    // slither-disable-next-line reentrancy-eth
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) public payable onlyOwner {
        bytes32 id = hashOperation(target, value, data, salt);

        _beforeCall(id);
        _execute(target, value, data);
        emit CallExecuted(id, 0, target, value, data);
        _afterCall(id);
    }

    /**
     * @dev Execute an (ready) operation containing a batch of transactions.
     *
     * Emits one {CallExecuted} event per transaction in the batch.
     *
     * Requirements:
     *
     * - the caller must be the owner.
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        bytes32 salt
    ) public payable onlyOwner {
        require(
            targets.length == values.length,
            "TimelockController: length mismatch"
        );
        require(
            targets.length == datas.length,
            "TimelockController: length mismatch"
        );

        bytes32 id = hashOperationBatch(targets, values, datas, salt);

        _beforeCall(id);
        for (uint256 i = 0; i < targets.length; ++i) {
            address target = targets[i];
            uint256 value = values[i];
            bytes calldata data = datas[i];
            _execute(target, value, data);
            emit CallExecuted(id, i, target, value, data);
        }
        _afterCall(id);
    }

    /**
     * @dev Execute an operation's call.
     */
    function _execute(
        address target,
        uint256 value,
        bytes calldata data
    ) internal {
        (bool success, ) = target.call{value: value}(data);
        require(success, "TimelockController: underlying transaction reverted");
    }

    /**
     * @dev Checks before execution of an operation's calls.
     */
    function _beforeCall(bytes32 id) private view {
        require(
            isOperationReady(id),
            "TimelockController: operation is not ready"
        );
    }

    /**
     * @dev Checks after execution of an operation's calls.
     */
    function _afterCall(bytes32 id) private {
        require(
            isOperationReady(id),
            "TimelockController: operation is not ready"
        );
        _timestamps[id] = _DONE_TIMESTAMP;
    }

    /**
     * @dev Changes the minimum timelock duration for future operations.
     *
     * Emits a {MinDelayChange} event.
     *
     * Requirements:
     *
     * - the caller must be the timelock itself. This can only be achieved by scheduling and later executing
     * an operation where the timelock is the target and the data is the ABI-encoded call to this function.
     */
    function updateDelay(uint256 newDelay) external {
        require(
            msg.sender == address(this),
            "TimelockController: caller must be timelock"
        );
        emit MinDelayChange(_minDelay, newDelay);
        _minDelay = newDelay;
    }
}
