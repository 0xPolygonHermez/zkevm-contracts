// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

// Contract under test
import {AgglayerOFTAdapter} from "contracts/dvn/AgglayerOFTAdapter.sol";

// Types
import {LzRoutePolicy} from "contracts/dvn/LzRoutePolicy.sol";
import {IAggLayerOFTReceiver, Origin, AggLayerClaim} from "contracts/dvn/IAggLayerOFTReceiver.sol";
import {AggLayerOFTPayloadCodec, AggLayerOFTPayloadV1} from "contracts/dvn/AggLayerOFTPayloadV1.sol";
import {OFTMsgCodec} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTMsgCodec.sol";
import {SendParam, MessagingFee, MessagingReceipt, OFTReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";
import {
    Origin as LzOrigin,
    MessagingParams,
    MessagingReceipt as LzMessagingReceipt
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

// OpenZeppelin
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ============================================================================
// Minimal mocks
// ============================================================================

/**
 * @notice Minimal ERC20 token for testing (6 decimals to match USDT).
 */
contract MockToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @notice Mock AgglayerBridge that records bridgeAsset calls and exposes
 *         depositCount. Also implements claimAsset as a no-op token transfer.
 */
contract MockBridge {
    uint256 public depositCount;

    // Last bridgeAsset call parameters
    uint32 public lastDstNetwork;
    address public lastDstAddress;
    uint256 public lastAmount;
    address public lastToken;
    bool public bridgeCalled;

    address internal _token;

    constructor(address token_) {
        _token = token_;
    }

    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool,
        bytes calldata
    ) external payable {
        lastDstNetwork = destinationNetwork;
        lastDstAddress = destinationAddress;
        lastAmount = amount;
        lastToken = token;
        bridgeCalled = true;
        // Pull tokens from caller (the adapter approved us)
        IERC20(_token).transferFrom(msg.sender, address(this), amount);
        depositCount++;
    }

    function claimAsset(
        bytes32[32] calldata,
        bytes32[32] calldata,
        uint256,
        bytes32,
        bytes32,
        uint32,
        address,
        uint32,
        address destinationAddress,
        uint256 amount,
        bytes calldata
    ) external {
        // Transfer tokens to the destination address (simulates a successful claim)
        IERC20(_token).transfer(destinationAddress, amount);
    }
}

/**
 * @notice Mock LayerZero EndpointV2 that implements the ILayerZeroEndpointV2
 *         interface minimally so OAppCore/OAppSender/OAppReceiver work correctly.
 *
 *         Key behaviours:
 *         - setDelegate: no-op (called in OAppCore constructor)
 *         - send: returns a fake MessagingReceipt
 *         - quote: returns zero fees
 *         - deliverMessage: calls lzReceive on a target OApp from msg.sender=this
 */
contract MockLzEndpoint {
    bytes32 public lastGuid;
    bytes public lastMessage;

    function setDelegate(address) external {}

    /**
     * @notice Minimal send implementation that returns a valid MessagingReceipt.
     *         Records the message for verification.
     */
    function send(
        MessagingParams calldata params,
        address /* refundAddress */
    ) external payable returns (LzMessagingReceipt memory receipt) {
        lastGuid = keccak256(abi.encode(block.timestamp, msg.sender, params.dstEid));
        lastMessage = params.message;
        receipt = LzMessagingReceipt({
            guid: lastGuid,
            nonce: 1,
            fee: MessagingFee({nativeFee: 0, lzTokenFee: 0})
        });
    }

    function quote(
        MessagingParams calldata,
        address
    ) external pure returns (MessagingFee memory) {
        return MessagingFee({nativeFee: 0, lzTokenFee: 0});
    }

    /**
     * @notice Deliver a message to an OApp by calling lzReceive from address(this).
     *         The OApp trusts msg.sender == address(endpoint), so calling from here
     *         bypasses the OnlyEndpoint guard.
     */
    function deliverMessage(
        address target,
        LzOrigin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) external {
        // lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)
        (bool ok, bytes memory err) = target.call(
            abi.encodeWithSignature(
                "lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)",
                origin,
                guid,
                message,
                executor,
                extraData
            )
        );
        if (!ok) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }
}

// ============================================================================
// Test contract
// ============================================================================

contract AgglayerOFTAdapterTest is Test {
    using OFTMsgCodec for bytes32;

    // Actors
    address internal owner = address(0xA0);
    address internal user = address(0xB0);
    address internal coordinator = address(0xC0);
    address internal dstOFTReceiver = address(0xD0);

    // Contracts
    MockToken internal token;
    MockBridge internal bridge;
    MockLzEndpoint internal endpoint;
    AgglayerOFTAdapter internal adapter;

    // Route params
    uint32 internal constant SRC_EID = 30101; // Ethereum mainnet LZ eid
    uint32 internal constant DST_EID = 30109; // Polygon PoS LZ eid
    uint32 internal constant DST_BRIDGE_NETWORK = 1; // Polygon in AggLayer

    function setUp() public {
        vm.startPrank(owner);

        token = new MockToken("USD Tether", "USDT", 6);
        bridge = new MockBridge(address(token));
        endpoint = new MockLzEndpoint();

        adapter = new AgglayerOFTAdapter(
            address(token),
            address(endpoint),
            owner,
            address(bridge)
        );

        // Configure coordinator
        adapter.setCoordinator(coordinator);

        // Configure route for DST_EID
        LzRoutePolicy memory policy = LzRoutePolicy({
            sourceBridgeNetwork: 0, // Ethereum mainnet = 0
            destinationBridgeNetwork: DST_BRIDGE_NETWORK,
            peerSrcEid: SRC_EID,
            peerDstEid: DST_EID,
            srcOFT: address(adapter),
            dstOFTReceiver: dstOFTReceiver,
            tokenSrc: address(token),
            tokenDst: address(0) // N/A for this test
        });
        adapter.setRoute(DST_EID, policy);

        // Set peer for DST_EID (required by _lzSend -> _getPeerOrRevert)
        adapter.setPeer(DST_EID, bytes32(uint256(uint160(dstOFTReceiver))));

        // Set peer for SRC_EID using the adapter's own address (for lzReceive)
        // _getPeerOrRevert(origin.srcEid) must match origin.sender
        adapter.setPeer(SRC_EID, bytes32(uint256(uint160(address(adapter)))));

        vm.stopPrank();

        // Fund user
        token.mint(user, 1_000_000e6);
    }

    // =========================================================================
    // Test 1: Source path — bridgeAsset called with dstOFTReceiver, not user
    // =========================================================================

    /**
     * @notice Verifies that send() calls bridgeAsset with dstOFTReceiver as
     *         destinationAddress (the custody contract), NOT the end user.
     */
    function test_send_aglRoute_calls_bridge_with_dstOFTReceiver() public {
        uint256 sendAmount = 1_000e6; // 1000 USDT

        // User approves adapter
        vm.startPrank(user);
        token.approve(address(adapter), sendAmount);

        SendParam memory sendParam = SendParam({
            dstEid: DST_EID,
            to: bytes32(uint256(uint160(user))), // recipient on dst
            amountLD: sendAmount,
            minAmountLD: sendAmount,
            extraOptions: "",
            composeMsg: "",
            oftCmd: ""
        });

        MessagingFee memory fee = MessagingFee({nativeFee: 0, lzTokenFee: 0});

        adapter.send(sendParam, fee, user);
        vm.stopPrank();

        // Verify bridge was called
        assertTrue(bridge.bridgeCalled(), "bridgeAsset not called");

        // Verify destinationAddress is dstOFTReceiver, NOT the user
        assertEq(bridge.lastDstAddress(), dstOFTReceiver, "destinationAddress should be dstOFTReceiver");
        assertTrue(bridge.lastDstAddress() != user, "destinationAddress must not be user");

        // Verify amount and network
        assertEq(bridge.lastAmount(), sendAmount, "amount mismatch");
        assertEq(bridge.lastDstNetwork(), DST_BRIDGE_NETWORK, "dst network mismatch");
        assertEq(bridge.lastToken(), address(token), "token mismatch");
    }

    // =========================================================================
    // Test 2: claimAndReserve from non-coordinator reverts
    // =========================================================================

    /**
     * @notice Verifies that claimAndReserve reverts when called by any address
     *         that is not the registered coordinator.
     */
    function test_claimAndReserve_nonCoordinator_reverts() public {
        address nonCoordinator = address(0x1234);

        Origin memory origin = Origin({
            srcEid: SRC_EID,
            sender: bytes32(uint256(uint160(address(adapter)))),
            nonce: 1
        });
        bytes32 guid = keccak256("test-guid");
        bytes memory message = _buildWrappedMessage(user, 100e6, 1 << 64);
        AggLayerClaim memory claim = _buildClaim(100e6, 1 << 64);

        vm.prank(nonCoordinator);
        vm.expectRevert(
            abi.encodeWithSelector(AgglayerOFTAdapter.NotCoordinator.selector, nonCoordinator)
        );
        adapter.claimAndReserve(origin, guid, message, claim);
    }

    // =========================================================================
    // Test 3: _lzReceive without reservation reverts
    // =========================================================================

    /**
     * @notice Verifies that the LayerZero receive path reverts if there is no
     *         pre-existing reservation for the given packet identifier.
     */
    function test_lzReceive_without_reservation_reverts() public {
        // Build a message that looks like an AggLayer payload
        bytes memory message = _buildWrappedMessage(user, 100e6, 1 << 64);

        LzOrigin memory origin = LzOrigin({
            srcEid: SRC_EID,
            sender: bytes32(uint256(uint160(address(adapter)))),
            nonce: 42
        });
        bytes32 guid = keccak256("unreserved-guid");

        // Compute the release key to get the correct error selector
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(adapter),
                guid,
                payloadHash
            )
        );

        // Deliver message from endpoint address — should revert with NoReservation
        vm.prank(address(endpoint));
        vm.expectRevert(
            abi.encodeWithSelector(AgglayerOFTAdapter.NoReservation.selector, releaseKey)
        );
        adapter.lzReceive(origin, guid, message, address(0), "");
    }

    // =========================================================================
    // Test 4 (bonus): claimAndReserve + lzReceive happy path
    // =========================================================================

    /**
     * @notice Happy path: coordinator reserves, then lzReceive releases tokens.
     */
    function test_claimAndReserve_then_lzReceive_releases_tokens() public {
        uint256 amount = 500e6;
        uint256 globalIndex = (1 << 64) + 5; // mainnet, leafIndex 5

        // Mint tokens into bridge so claimAsset can transfer them to adapter
        token.mint(address(bridge), amount);

        Origin memory origin = Origin({
            srcEid: SRC_EID,
            sender: bytes32(uint256(uint160(address(adapter)))),
            nonce: 7
        });
        bytes32 guid = keccak256("happy-guid");
        bytes memory message = _buildWrappedMessage(user, amount, globalIndex);
        AggLayerClaim memory claim = _buildClaim(amount, globalIndex);

        // Coordinator calls claimAndReserve
        vm.prank(coordinator);
        adapter.claimAndReserve(origin, guid, message, claim);

        // Verify reservation exists
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(adapter),
                guid,
                payloadHash
            )
        );
        assertTrue(adapter.isReserved(releaseKey), "should be reserved");
        assertFalse(adapter.isReleased(releaseKey), "should not be released yet");

        // Check adapter received tokens from claimAsset
        uint256 adapterBalance = token.balanceOf(address(adapter));
        assertEq(adapterBalance, amount, "adapter should hold claimed tokens");

        // Endpoint delivers the LZ message (triggers lzReceive -> _lzReceive)
        LzOrigin memory lzOrigin = LzOrigin({
            srcEid: origin.srcEid,
            sender: origin.sender,
            nonce: origin.nonce
        });

        uint256 userBalanceBefore = token.balanceOf(user);

        // Call lzReceive directly from the endpoint address
        vm.prank(address(endpoint));
        adapter.lzReceive(lzOrigin, guid, message, address(0), "");

        // Verify released flag set
        assertTrue(adapter.isReleased(releaseKey), "should be released");

        // Verify user received tokens
        uint256 userBalanceAfter = token.balanceOf(user);
        assertEq(userBalanceAfter - userBalanceBefore, amount, "user should receive tokens");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * @dev Builds a minimal AggLayerOFTPayloadV1-wrapped OFT message.
     * @param recipient   Address that will receive tokens on destination.
     * @param amountLD    Amount in local decimals (6 decimal USDT).
     * @param globalIndex AggLayer bridge global deposit index.
     */
    function _buildWrappedMessage(
        address recipient,
        uint256 amountLD,
        uint256 globalIndex
    ) internal pure returns (bytes memory) {
        // OFT shared decimals = 6, decimalConversionRate = 1 for 6-decimal token
        // amountSD = amountLD / decimalConversionRate = amountLD
        bytes32 sendTo = bytes32(uint256(uint160(recipient)));
        uint64 amountSD = uint64(amountLD);
        bytes memory oftMessage = abi.encodePacked(sendTo, amountSD);
        return AggLayerOFTPayloadCodec.encode(oftMessage, globalIndex);
    }

    /**
     * @dev Builds a minimal AggLayerClaim with the given amount and globalIndex.
     *      destinationAddress = address(adapter), destinationNetwork = 0 (mainnet).
     */
    function _buildClaim(uint256 amount, uint256 globalIndex) internal view returns (AggLayerClaim memory) {
        bytes32[32] memory emptyProof;
        return AggLayerClaim({
            smtProofLocalExitRoot: emptyProof,
            smtProofRollupExitRoot: emptyProof,
            globalIndex: globalIndex,
            mainnetExitRoot: bytes32(0),
            rollupExitRoot: bytes32(0),
            originNetwork: 0,
            originTokenAddress: address(token),
            destinationNetwork: 0, // mainnet (this chain)
            destinationAddress: address(adapter),
            amount: amount,
            metadata: ""
        });
    }
}
