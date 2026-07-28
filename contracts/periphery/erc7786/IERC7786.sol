// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

/**
 * @title IERC7786GatewaySource
 * @notice Interface for ERC-7786 source gateways, contracts that offer a protocol
 * to send a message to a recipient on another chain.
 * See https://eips.ethereum.org/EIPS/eip-7786
 */
interface IERC7786GatewaySource {
    /**
     * @notice Signals that a would-be sender has requested a message to be sent
     * @param sendId Unique identifier to track the lifecycle of the message in the
     * source gateway. May be zero if the gateway does not generate one.
     * @param sender Binary Interoperable Address (ERC-7930) of the sender
     * @param recipient Binary Interoperable Address (ERC-7930) of the recipient
     * @param payload Message payload
     * @param value Native token value sent with the message
     * @param attributes List of attributes, each element is the concatenation of a
     * bytes4 key and the ABI-encoded value
     */
    event MessageSent(
        bytes32 indexed sendId,
        bytes sender,
        bytes recipient,
        bytes payload,
        uint256 value,
        bytes[] attributes
    );

    /**
     * @dev An unsupported attribute was included in the attributes list
     */
    error UnsupportedAttribute(bytes4 selector);

    /**
     * @notice Returns whether an attribute (identified by its key) is supported by the gateway
     * @param selector The 4-byte attribute key
     */
    function supportsAttribute(bytes4 selector) external view returns (bool);

    /**
     * @notice Initiates the sending of a message
     * @param recipient Binary Interoperable Address (ERC-7930) of the recipient
     * @param payload Message payload
     * @param attributes List of attributes, each element is the concatenation of a
     * bytes4 key and the ABI-encoded value
     * @return sendId Unique non-zero send identifier, or zero
     */
    function sendMessage(
        bytes calldata recipient,
        bytes calldata payload,
        bytes[] calldata attributes
    ) external payable returns (bytes32 sendId);
}

/**
 * @title IERC7786Recipient
 * @notice Interface that must be implemented by contracts receiving
 * cross-chain messages through an ERC-7786 destination gateway.
 * See https://eips.ethereum.org/EIPS/eip-7786
 */
interface IERC7786Recipient {
    /**
     * @notice Delivery of a message sent from another chain
     * @dev The recipient must validate that the caller of this function is a known gateway
     * @param receiveId Unique identifier (for the calling gateway) of the message being relayed
     * @param sender Binary Interoperable Address (ERC-7930) of the sender
     * @param payload Message payload
     * @return Must return IERC7786Recipient.receiveMessage.selector (0x2432ef26)
     */
    function receiveMessage(
        bytes32 receiveId,
        bytes calldata sender,
        bytes calldata payload
    ) external payable returns (bytes4);
}
