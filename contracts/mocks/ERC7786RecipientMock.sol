// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IERC7786Recipient} from "../periphery/erc7786/IERC7786.sol";

/**
 * @title ERC7786RecipientMock
 * @author Polygon Technology
 * @notice Mock ERC-7786 recipient that records received messages, used to test
 * the AgglayerERC7786Gateway delivery path
 */
contract ERC7786RecipientMock is IERC7786Recipient {
    /// @notice Receive id of the last received message
    bytes32 public lastReceiveId;

    /// @notice ERC-7930 sender of the last received message
    bytes public lastSender;

    /// @notice Payload of the last received message
    bytes public lastPayload;

    /// @notice Native value received with the last message
    uint256 public lastValue;

    /// @notice Caller (gateway) of the last received message
    address public lastCaller;

    /// @notice Number of messages received
    uint256 public receivedCount;

    /// @notice If true, receiveMessage returns a wrong selector
    bool public returnInvalidSelector;

    /**
     * @notice Configures whether receiveMessage returns a wrong selector
     * @param value True to return a wrong selector
     */
    function setReturnInvalidSelector(bool value) external {
        returnInvalidSelector = value;
    }

    /**
     * @notice Records the received message
     * @param receiveId Unique identifier of the message being relayed
     * @param sender Binary Interoperable Address (ERC-7930) of the sender
     * @param payload Message payload
     * @return The receiveMessage selector, or a wrong one if configured
     */
    function receiveMessage(
        bytes32 receiveId,
        bytes calldata sender,
        bytes calldata payload
    ) external payable returns (bytes4) {
        lastReceiveId = receiveId;
        lastSender = sender;
        lastPayload = payload;
        lastValue = msg.value;
        lastCaller = msg.sender;
        ++receivedCount;

        if (returnInvalidSelector) {
            return 0xffffffff;
        }
        return IERC7786Recipient.receiveMessage.selector;
    }
}
