// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

// Contract under test
import {AgglayerOFT} from "contracts/dvn/AgglayerOFT.sol";

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

// ============================================================================
// Minimal mocks
// ============================================================================

/**
 * @notice Mock AgglayerBridge for the mint/burn OFT side.
 *
 *         On the Polygon side the OFT burns tokens before calling bridgeAsset,
 *         so the mock does NOT attempt to pull tokens from the caller.
 *         It records the bridgeAsset call parameters for assertion.
 *
 *         claimAsset is a no-op in this mock (on the mint/burn chain the
 *         claimAsset call simply proves the bridge exit; actual minting is
 *         done by _lzReceive via _mint).
 */
contract MockBridgeOFT {
    uint256 public depositCount;

    // Last bridgeAsset call parameters
    uint32 public lastDstNetwork;
    address public lastDstAddress;
    uint256 public lastAmount;
    address public lastToken;
    bool public bridgeCalled;

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
        address, // destinationAddress — ignored on mint/burn chain
        uint256, // amount — ignored; minting is done by _lzReceive
        bytes calldata
    ) external {
        // no-op: on mint/burn chain the bridge proof is verified off-chain;
        // actual token creation happens in _lzReceive via _mint.
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
contract MockLzEndpointOFT {
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
// Test-only subclass to expose internal mint
// ============================================================================

/**
 * @dev Thin wrapper that adds a public mint() for test setup only.
 *      Not for production use.
 */
contract TestAgglayerOFT is AgglayerOFT {
    constructor(
        string memory name_,
        string memory symbol_,
        address lzEndpoint_,
        address initialOwner_,
        address aggLayerBridge_
    ) AgglayerOFT(name_, symbol_, lzEndpoint_, initialOwner_, aggLayerBridge_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ============================================================================
// Test contract
// ============================================================================

contract AgglayerOFTTest is Test {
    using OFTMsgCodec for bytes32;

    // Actors
    address internal owner = address(0xA0);
    address internal user = address(0xB0);
    address internal coordinator = address(0xC0);
    address internal dstOFTReceiver = address(0xD0);

    // Contracts
    MockBridgeOFT internal bridge;
    MockLzEndpointOFT internal endpoint;
    TestAgglayerOFT internal oft;

    // Route params
    uint32 internal constant SRC_EID = 30109; // Polygon PoS LZ eid (this chain)
    uint32 internal constant DST_EID = 30101; // Ethereum mainnet LZ eid
    uint32 internal constant SRC_BRIDGE_NETWORK = 1; // Polygon in AggLayer
    uint32 internal constant DST_BRIDGE_NETWORK = 0; // Mainnet in AggLayer

    // Address on source bridge for the token (e.g. wrapped POL on Polygon bridge).
    // For the burn side we pass address(0) to mean "native-gas token" or the
    // wrapped token address from the policy; here we use a non-zero sentinel.
    address internal constant TOKEN_SRC = address(0xE0);

    function setUp() public {
        vm.startPrank(owner);

        bridge = new MockBridgeOFT();
        endpoint = new MockLzEndpointOFT();

        // OFT IS the token: 18-decimal, name "Polygon OFT", symbol "polOFT".
        oft = new TestAgglayerOFT(
            "Polygon OFT",
            "polOFT",
            address(endpoint),
            owner,
            address(bridge)
        );

        // Configure coordinator
        oft.setCoordinator(coordinator);

        // Configure route for DST_EID (Ethereum mainnet)
        LzRoutePolicy memory policy = LzRoutePolicy({
            sourceBridgeNetwork: SRC_BRIDGE_NETWORK,
            destinationBridgeNetwork: DST_BRIDGE_NETWORK,
            peerSrcEid: SRC_EID,
            peerDstEid: DST_EID,
            srcOFT: address(oft),
            dstOFTReceiver: dstOFTReceiver,
            tokenSrc: TOKEN_SRC,
            tokenDst: address(0) // N/A for this test
        });
        oft.setRoute(DST_EID, policy);

        // Set peer for DST_EID (required by _lzSend -> _getPeerOrRevert)
        oft.setPeer(DST_EID, bytes32(uint256(uint160(dstOFTReceiver))));

        // Set peer for SRC_EID using the OFT's own address (for lzReceive)
        // _getPeerOrRevert(origin.srcEid) must match origin.sender
        oft.setPeer(SRC_EID, bytes32(uint256(uint160(address(oft)))));

        vm.stopPrank();

        // Mint OFT tokens to the user for send() tests.
        // TestAgglayerOFT exposes _mint via a public mint() for test setup.
        oft.mint(user, 1_000_000 ether);
    }

    // =========================================================================
    // Test 1: Source path — send() burns tokens and calls bridgeAsset
    // =========================================================================

    /**
     * @notice Verifies that send() burns the user's OFT tokens and calls
     *         bridgeAsset with dstOFTReceiver as destinationAddress (the
     *         custody contract on the destination chain), NOT the end user.
     */
    function test_send_aglRoute_burns_and_calls_bridge() public {
        uint256 sendAmount = 1_000 ether;

        uint256 userBalanceBefore = oft.balanceOf(user);

        vm.startPrank(user);

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

        oft.send(sendParam, fee, user);
        vm.stopPrank();

        // Verify bridge was called
        assertTrue(bridge.bridgeCalled(), "bridgeAsset not called");

        // Verify destinationAddress is dstOFTReceiver, NOT the user
        assertEq(bridge.lastDstAddress(), dstOFTReceiver, "destinationAddress should be dstOFTReceiver");
        assertTrue(bridge.lastDstAddress() != user, "destinationAddress must not be user");

        // Verify amount and network
        assertEq(bridge.lastAmount(), sendAmount, "amount mismatch");
        assertEq(bridge.lastDstNetwork(), DST_BRIDGE_NETWORK, "dst network mismatch");

        // Verify tokens were burned from the user
        uint256 userBalanceAfter = oft.balanceOf(user);
        assertEq(userBalanceBefore - userBalanceAfter, sendAmount, "tokens should be burned from user");

        // Verify OFT total supply decreased (burn)
        // (Other holders don't exist here, so totalSupply = userBalance)
        assertEq(oft.totalSupply(), userBalanceAfter, "total supply should reflect burn");
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
            srcEid: DST_EID, // tokens come from Ethereum
            sender: bytes32(uint256(uint160(dstOFTReceiver))),
            nonce: 1
        });
        bytes32 guid = keccak256("test-guid");
        bytes memory message = _buildWrappedMessage(user, 100 ether, 1 << 64);
        AggLayerClaim memory claim = _buildClaim(100 ether, 1 << 64);

        vm.prank(nonCoordinator);
        vm.expectRevert(
            abi.encodeWithSelector(AgglayerOFT.NotCoordinator.selector, nonCoordinator)
        );
        oft.claimAndReserve(origin, guid, message, claim);
    }

    // =========================================================================
    // Test 3: _lzReceive without reservation reverts
    // =========================================================================

    /**
     * @notice Verifies that the LayerZero receive path reverts if there is no
     *         pre-existing reservation for the given packet identifier.
     */
    function test_lzReceive_without_reservation_reverts() public {
        bytes memory message = _buildWrappedMessage(user, 100 ether, 1 << 64);

        LzOrigin memory origin = LzOrigin({
            srcEid: DST_EID, // tokens come from Ethereum
            sender: bytes32(uint256(uint160(dstOFTReceiver))),
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
                address(oft),
                guid,
                payloadHash
            )
        );

        // Deliver message from endpoint address — should revert with NoReservation
        vm.prank(address(endpoint));
        vm.expectRevert(
            abi.encodeWithSelector(AgglayerOFT.NoReservation.selector, releaseKey)
        );
        oft.lzReceive(origin, guid, message, address(0), "");
    }

    // =========================================================================
    // Test 4: claimAndReserve + lzReceive happy path — mints tokens
    // =========================================================================

    /**
     * @notice Happy path: coordinator reserves via claimAndReserve, then
     *         lzReceive mints OFT tokens to the recipient.
     */
    function test_claimAndReserve_then_lzReceive_mints_tokens() public {
        uint256 amount = 500 ether;
        uint256 globalIndex = (1 << 64) + 5; // mainnet deposit, leafIndex 5

        Origin memory origin = Origin({
            srcEid: DST_EID, // tokens come from Ethereum
            sender: bytes32(uint256(uint160(dstOFTReceiver))),
            nonce: 7
        });
        bytes32 guid = keccak256("happy-guid");
        bytes memory message = _buildWrappedMessage(user, amount, globalIndex);
        AggLayerClaim memory claim = _buildClaim(amount, globalIndex);

        // Coordinator calls claimAndReserve
        vm.prank(coordinator);
        oft.claimAndReserve(origin, guid, message, claim);

        // Verify reservation exists
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(oft),
                guid,
                payloadHash
            )
        );
        assertTrue(oft.isReserved(releaseKey), "should be reserved");
        assertFalse(oft.isReleased(releaseKey), "should not be released yet");

        // Record user OFT balance before receive
        uint256 userBalanceBefore = oft.balanceOf(user);

        // Endpoint delivers the LZ message (triggers lzReceive -> _lzReceive -> _mint)
        LzOrigin memory lzOrigin = LzOrigin({
            srcEid: origin.srcEid,
            sender: origin.sender,
            nonce: origin.nonce
        });

        vm.prank(address(endpoint));
        oft.lzReceive(lzOrigin, guid, message, address(0), "");

        // Verify released flag set
        assertTrue(oft.isReleased(releaseKey), "should be released");

        // Verify user received minted OFT tokens
        uint256 userBalanceAfter = oft.balanceOf(user);
        assertEq(userBalanceAfter - userBalanceBefore, amount, "user should receive minted tokens");
    }

    // =========================================================================
    // Test 5: reserveAfterClaim + lzReceive happy path
    // =========================================================================

    /**
     * @notice Happy path (front-run path): coordinator calls reserveAfterClaim
     *         (skipping the claimAsset call), then lzReceive mints tokens.
     */
    function test_reserveAfterClaim_then_lzReceive_mints_tokens() public {
        uint256 amount = 250 ether;
        uint256 globalIndex = (1 << 64) + 9; // mainnet deposit, leafIndex 9

        Origin memory origin = Origin({
            srcEid: DST_EID,
            sender: bytes32(uint256(uint160(dstOFTReceiver))),
            nonce: 13
        });
        bytes32 guid = keccak256("frontrun-guid");
        bytes memory message = _buildWrappedMessage(user, amount, globalIndex);
        AggLayerClaim memory claim = _buildClaim(amount, globalIndex);

        // Coordinator calls reserveAfterClaim (front-run path — claim already done)
        vm.prank(coordinator);
        oft.reserveAfterClaim(origin, guid, message, claim);

        // Verify reservation
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(oft),
                guid,
                payloadHash
            )
        );
        assertTrue(oft.isReserved(releaseKey), "should be reserved");

        uint256 userBalanceBefore = oft.balanceOf(user);

        // Deliver the LZ message
        LzOrigin memory lzOrigin = LzOrigin({
            srcEid: origin.srcEid,
            sender: origin.sender,
            nonce: origin.nonce
        });

        vm.prank(address(endpoint));
        oft.lzReceive(lzOrigin, guid, message, address(0), "");

        assertTrue(oft.isReleased(releaseKey), "should be released");

        uint256 userBalanceAfter = oft.balanceOf(user);
        assertEq(userBalanceAfter - userBalanceBefore, amount, "user should receive minted tokens");
    }

    // =========================================================================
    // Test 6: Double-release reverts
    // =========================================================================

    /**
     * @notice Verifies that attempting to release (lzReceive) an already-released
     *         packet reverts with AlreadyReleased.
     */
    function test_lzReceive_doubleRelease_reverts() public {
        uint256 amount = 100 ether;
        uint256 globalIndex = (1 << 64) + 3;

        Origin memory origin = Origin({
            srcEid: DST_EID,
            sender: bytes32(uint256(uint160(dstOFTReceiver))),
            nonce: 99
        });
        bytes32 guid = keccak256("double-release-guid");
        bytes memory message = _buildWrappedMessage(user, amount, globalIndex);
        AggLayerClaim memory claim = _buildClaim(amount, globalIndex);

        // Reserve
        vm.prank(coordinator);
        oft.claimAndReserve(origin, guid, message, claim);

        LzOrigin memory lzOrigin = LzOrigin({
            srcEid: origin.srcEid,
            sender: origin.sender,
            nonce: origin.nonce
        });

        // First release — succeeds
        vm.prank(address(endpoint));
        oft.lzReceive(lzOrigin, guid, message, address(0), "");

        // Compute release key for error selector
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(oft),
                guid,
                payloadHash
            )
        );

        // Second release — should revert
        vm.prank(address(endpoint));
        vm.expectRevert(
            abi.encodeWithSelector(AgglayerOFT.AlreadyReleased.selector, releaseKey)
        );
        oft.lzReceive(lzOrigin, guid, message, address(0), "");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * @dev Builds a minimal AggLayerOFTPayloadV1-wrapped OFT message.
     * @param recipient   Address that will receive tokens on destination.
     * @param amountLD    Amount in local decimals (18-decimal OFT).
     * @param globalIndex AggLayer bridge global deposit index.
     *
     * OFT.sharedDecimals() = 6, decimalConversionRate = 10^(18-6) = 10^12.
     * amountSD = amountLD / 10^12.
     */
    function _buildWrappedMessage(
        address recipient,
        uint256 amountLD,
        uint256 globalIndex
    ) internal pure returns (bytes memory) {
        bytes32 sendTo = bytes32(uint256(uint160(recipient)));
        // decimalConversionRate for 18-decimal OFT with sharedDecimals=6 is 10^12
        uint64 amountSD = uint64(amountLD / 1e12);
        bytes memory oftMessage = abi.encodePacked(sendTo, amountSD);
        return AggLayerOFTPayloadCodec.encode(oftMessage, globalIndex);
    }

    /**
     * @dev Builds a minimal AggLayerClaim with the given amount and globalIndex.
     *      destinationAddress = address(oft), destinationNetwork = Polygon (1).
     */
    function _buildClaim(uint256 amount, uint256 globalIndex) internal view returns (AggLayerClaim memory) {
        bytes32[32] memory emptyProof;
        return AggLayerClaim({
            smtProofLocalExitRoot: emptyProof,
            smtProofRollupExitRoot: emptyProof,
            globalIndex: globalIndex,
            mainnetExitRoot: bytes32(0),
            rollupExitRoot: bytes32(0),
            originNetwork: 0, // tokens originated on mainnet
            originTokenAddress: address(0), // ETH/native or the Ethereum-side token
            destinationNetwork: SRC_BRIDGE_NETWORK, // Polygon
            destinationAddress: address(oft),
            amount: amount,
            metadata: ""
        });
    }
}
