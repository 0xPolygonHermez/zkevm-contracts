// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts5/access/Ownable.sol";
import {IBridgeMessageReceiver} from "../../interfaces/IBridgeMessageReceiver.sol";
import {IERC7786GatewaySource, IERC7786Recipient} from "./IERC7786.sol";
import {InteroperableAddress} from "./InteroperableAddress.sol";

/**
 * @dev Minimal interface of the AgglayerBridge required by the gateway
 */
interface IAgglayerBridgeMessenger {
    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable;

    function networkID() external view returns (uint32);
}

/**
 * @title AgglayerERC7786Gateway
 * @notice ERC-7786 gateway adapter on top of the AgglayerBridge message-passing layer.
 * See https://eips.ethereum.org/EIPS/eip-7786
 *
 * Acts as a source gateway: `sendMessage` wraps the message into the AgglayerBridge
 * `bridgeMessage` flow, targeting the trusted counterpart gateway on the destination
 * network. Acts as a destination gateway: `onMessageReceived` (invoked by the bridge
 * on claim) validates the origin and forwards the message to the final
 * `IERC7786Recipient`.
 *
 * ERC-7930 interoperable addresses use eip155 (EVM) chain ids. The owner registers
 * each remote network with a single call to `registerRemoteNetwork`, which maps the
 * chain id to the Agglayer network id and sets the trusted counterpart gateway
 * deployed on that network.
 */
contract AgglayerERC7786Gateway is
    IERC7786GatewaySource,
    IBridgeMessageReceiver,
    Ownable
{
    using InteroperableAddress for bytes;

    /**
     * @dev Attribute key for `forceUpdateGlobalExitRoot(bool)`, forwarded to
     * the bridge to force an update of the global exit root when bridging
     */
    bytes4 public constant FORCE_UPDATE_GLOBAL_EXIT_ROOT_ATTRIBUTE =
        bytes4(keccak256("forceUpdateGlobalExitRoot(bool)"));

    /// @notice AgglayerBridge this gateway wraps
    IAgglayerBridgeMessenger public immutable bridge;

    /// @notice Agglayer network id of the network this gateway is deployed on
    uint32 public immutable localNetworkID;

    /// @notice EIP-155 chain id -> Agglayer network id (+1, 0 means unregistered)
    mapping(uint256 chainId => uint256 networkIdPlusOne)
        internal _chainIdToNetworkID;

    /// @notice Agglayer network id -> EIP-155 chain id (0 means unregistered)
    mapping(uint32 networkID => uint256 chainId) public networkIDToChainId;

    /// @notice Agglayer network id -> trusted counterpart gateway on that network
    mapping(uint32 networkID => address gateway) public remoteGateways;

    /// @notice Counter used to generate unique send identifiers
    uint256 public nonce;

    /**
     * @dev Emitted when a remote network (chainId <-> networkID pair and its
     * counterpart gateway) is registered
     */
    event RemoteNetworkRegistered(
        uint256 chainId,
        uint32 networkID,
        address gateway
    );

    /**
     * @dev Thrown when the destination chain id is not mapped to an Agglayer network id
     */
    error UnregisteredChain(uint256 chainId);

    /**
     * @dev Thrown when registering a remote network with empty values
     */
    error InvalidZeroValue();

    /**
     * @dev Thrown when `onMessageReceived` is not called by the bridge
     */
    error OnlyBridge();

    /**
     * @dev Thrown when the origin of a received message is not the trusted
     * counterpart gateway of the origin network
     */
    error UntrustedOriginGateway(uint32 originNetwork, address originAddress);

    /**
     * @dev Thrown when the recipient does not return the expected
     * `IERC7786Recipient.receiveMessage` selector
     */
    error InvalidRecipientReturnValue();

    /**
     * @param _bridge AgglayerBridge address
     * @param _initialOwner Owner allowed to register chains and remote gateways
     */
    constructor(
        IAgglayerBridgeMessenger _bridge,
        address _initialOwner
    ) Ownable(_initialOwner) {
        bridge = _bridge;
        localNetworkID = _bridge.networkID();
    }

    ////////////////////////////
    // Owner configuration
    ////////////////////////////

    /**
     * @notice Registers a remote network: maps its EIP-155 chain id to its Agglayer
     * network id (bidirectionally) and sets the trusted counterpart gateway deployed
     * on that network
     * @param chainId EIP-155 chain id of the remote network (must be non-zero)
     * @param networkID Agglayer network id of the remote network
     * @param gateway Counterpart gateway address on that network (must be non-zero)
     */
    function registerRemoteNetwork(
        uint256 chainId,
        uint32 networkID,
        address gateway
    ) external onlyOwner {
        if (chainId == 0 || gateway == address(0)) {
            revert InvalidZeroValue();
        }
        _chainIdToNetworkID[chainId] = uint256(networkID) + 1;
        networkIDToChainId[networkID] = chainId;
        remoteGateways[networkID] = gateway;

        emit RemoteNetworkRegistered(chainId, networkID, gateway);
    }

    ////////////////////////////
    // ERC-7786 source gateway
    ////////////////////////////

    /**
     * @inheritdoc IERC7786GatewaySource
     */
    function supportsAttribute(bytes4 selector) external pure returns (bool) {
        return selector == FORCE_UPDATE_GLOBAL_EXIT_ROOT_ATTRIBUTE;
    }

    /**
     * @inheritdoc IERC7786GatewaySource
     * @dev The recipient must be an ERC-7930 v1 eip155 address on a chain registered
     * via `registerRemoteNetwork`. Any native value is forwarded through the bridge
     * and delivered to the recipient on claim (only on ether gas token networks).
     */
    function sendMessage(
        bytes calldata recipient,
        bytes calldata payload,
        bytes[] calldata attributes
    ) external payable returns (bytes32 sendId) {
        sendId = keccak256(abi.encode(block.chainid, address(this), nonce++));

        _dispatchMessage(sendId, recipient, payload, attributes);

        emit MessageSent(
            sendId,
            InteroperableAddress.formatEvmV1(block.chainid, msg.sender),
            recipient,
            payload,
            msg.value,
            attributes
        );
    }

    /**
     * @dev Resolves the destination and bridges the message through the AgglayerBridge
     */
    function _dispatchMessage(
        bytes32 sendId,
        bytes calldata recipient,
        bytes calldata payload,
        bytes[] calldata attributes
    ) internal {
        (uint256 destinationChainId, address recipientAddress) = recipient
            .parseEvmV1();

        // Both mappings are set atomically in registerRemoteNetwork, so a
        // registered chain id always has a non-zero counterpart gateway
        uint32 destinationNetwork = chainIdToNetworkID(destinationChainId);
        address remoteGateway = remoteGateways[destinationNetwork];

        bytes memory metadata = abi.encode(
            sendId,
            msg.sender,
            recipientAddress,
            payload
        );

        bridge.bridgeMessage{value: msg.value}(
            destinationNetwork,
            remoteGateway,
            _processAttributes(attributes),
            metadata
        );
    }

    ////////////////////////////
    // Destination gateway
    ////////////////////////////

    /**
     * @notice Entry point called by the AgglayerBridge when a message targeting this
     * gateway is claimed. Validates the origin and delivers the message to the final
     * ERC-7786 recipient, forwarding any native value.
     * @param originAddress Address that called `bridgeMessage` on the origin network
     * (must be the trusted counterpart gateway)
     * @param originNetwork Agglayer network id of the origin network
     * @param data Cross-chain metadata: abi.encode(sendId, sender, recipient, payload)
     */
    function onMessageReceived(
        address originAddress,
        uint32 originNetwork,
        bytes memory data
    ) external payable {
        if (msg.sender != address(bridge)) {
            revert OnlyBridge();
        }
        if (
            originAddress == address(0) ||
            originAddress != remoteGateways[originNetwork]
        ) {
            revert UntrustedOriginGateway(originNetwork, originAddress);
        }

        // Set atomically with remoteGateways in registerRemoteNetwork, so it is
        // always non-zero when the origin gateway is trusted
        uint256 originChainId = networkIDToChainId[originNetwork];

        (
            bytes32 sendId,
            address sender,
            address recipient,
            bytes memory payload
        ) = abi.decode(data, (bytes32, address, address, bytes));

        bytes4 returnValue = IERC7786Recipient(recipient).receiveMessage{
            value: msg.value
        }(
            sendId,
            InteroperableAddress.formatEvmV1(originChainId, sender),
            payload
        );

        if (returnValue != IERC7786Recipient.receiveMessage.selector) {
            revert InvalidRecipientReturnValue();
        }
    }

    ////////////////////////////
    // View functions
    ////////////////////////////

    /**
     * @notice Returns the Agglayer network id registered for an EIP-155 chain id
     * @dev Reverts if the chain id is not registered
     */
    function chainIdToNetworkID(uint256 chainId) public view returns (uint32) {
        uint256 networkIdPlusOne = _chainIdToNetworkID[chainId];
        if (networkIdPlusOne == 0) {
            revert UnregisteredChain(chainId);
        }
        return uint32(networkIdPlusOne - 1);
    }

    ////////////////////////////
    // Internal functions
    ////////////////////////////

    /**
     * @dev Validates the attributes list. Only `forceUpdateGlobalExitRoot(bool)`
     * is supported; any other attribute key reverts with `UnsupportedAttribute`.
     * If provided multiple times, the last value wins.
     */
    function _processAttributes(
        bytes[] calldata attributes
    ) internal pure returns (bool forceUpdateGlobalExitRoot) {
        for (uint256 i = 0; i < attributes.length; i++) {
            bytes calldata attribute = attributes[i];
            bytes4 selector = bytes4(attribute);
            if (
                selector != FORCE_UPDATE_GLOBAL_EXIT_ROOT_ATTRIBUTE ||
                attribute.length != 36
            ) {
                revert UnsupportedAttribute(selector);
            }
            forceUpdateGlobalExitRoot = abi.decode(attribute[4:], (bool));
        }
    }
}
