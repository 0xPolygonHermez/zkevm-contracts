// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

// OpenZeppelin v5
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// LayerZero imports
import {OFTAdapter} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFTAdapter.sol";
import {Origin as LzOrigin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {OFTMsgCodec} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/libs/OFTMsgCodec.sol";
import {SendParam, MessagingFee, MessagingReceipt, OFTReceipt} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/interfaces/IOFT.sol";

// OpenZeppelin v5 ERC20 helpers (re-exported by OFTAdapter, imported explicitly for SafeERC20 usage)
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Local DVN types
import {IAggLayerOFTReceiver, Origin, AggLayerClaim} from "./IAggLayerOFTReceiver.sol";
import {AggLayerOFTPayloadV1, AggLayerOFTPayloadCodec} from "./AggLayerOFTPayloadV1.sol";
import {LzRoutePolicy} from "./LzRoutePolicy.sol";
import {IAgglayerBridge} from "../interfaces/IAgglayerBridge.sol";

/**
 * @title AgglayerOFTAdapter
 * @notice Ethereum-side custodial OFT adapter that routes cross-chain token
 *         transfers through the AggLayer bridge instead of the standard
 *         LayerZero lock-and-mint flow.
 *
 * Source path (send):
 *   1. Accepts tokens from the user and bridges them via AgglayerBridge.
 *   2. Wraps the OFT message in AggLayerOFTPayloadV1 (magic "ALO1") so the
 *      destination DVN coordinator can match the bridge deposit to the LZ packet.
 *
 * Destination path (receive):
 *   1. The AggLayerDVNCoordinator calls claimAndReserve (or reserveAfterClaim)
 *      to bridge-claim the tokens and reserve the release slot.
 *   2. The LayerZero executor calls lzReceive; this contract's _lzReceive
 *      override checks the reservation and transfers tokens to the recipient.
 *
 * PoC simplifications (documented per FINAL-PROPOSAL.md §10):
 *   - Native gas-token routes revert ("native route not implemented in PoC").
 *   - No refund mechanism for expired reservations.
 *   - Coordinator is set-once from zero (no rotation).
 *
 * Storage: all new state uses ERC-7201 namespaced storage to avoid collisions
 * with OFTAdapter / OApp proxy slots.
 *
 * @custom:storage-location erc7201:agglayer.dvn.OFTAdapterStorage
 */
contract AgglayerOFTAdapter is OFTAdapter, IAggLayerOFTReceiver {
    using SafeERC20 for IERC20;
    using OFTMsgCodec for bytes;
    using OFTMsgCodec for bytes32;

    // -------------------------------------------------------------------------
    // ERC-7201 namespaced storage
    // -------------------------------------------------------------------------

    /// @dev keccak256(abi.encode(uint256(keccak256("agglayer.dvn.OFTAdapterStorage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant _OFT_ADAPTER_STORAGE_SLOT =
        0xbc7ac05ff3da9fd03ca777023fd9fadba552c7e3c5e4d55820d32fe07a3b0c00;

    struct OFTAdapterStorage {
        // Routes: dstEid => LzRoutePolicy (zero address dstOFTReceiver = not configured)
        mapping(uint32 => LzRoutePolicy) routes;
        // Coordinator address — set once from zero
        address aggLayerDVNCoordinator;
        // AggLayer bridge address
        address aggLayerBridge;
        // Reservations: releaseKey => true when reserved by coordinator
        mapping(bytes32 => bool) reservations;
        // Released: releaseKey => true when _lzReceive has consumed it
        mapping(bytes32 => bool) released;
        // Track last recorded balance for reserveAfterClaim balance-delta check
        uint256 lastRecordedBalance;
    }

    function _getStorage() private pure returns (OFTAdapterStorage storage $) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            $.slot := _OFT_ADAPTER_STORAGE_SLOT
        }
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotCoordinator(address caller);
    error CoordinatorAlreadySet();
    error RouteNotConfigured(uint32 dstEid);
    error NativeRouteNotImplemented();
    error NoReservation(bytes32 releaseKey);
    error AlreadyReleased(bytes32 releaseKey);
    error ReservationAlreadyExists(bytes32 releaseKey);
    error GlobalIndexMismatch(uint256 claimGlobalIndex, uint256 payloadGlobalIndex);
    error DestinationAddressMismatch(address claimDst, address expected);
    error InsufficientBalanceDelta(uint256 current, uint256 last, uint256 required);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RouteSet(uint32 indexed dstEid, LzRoutePolicy policy);
    event RouteCleared(uint32 indexed dstEid);
    event CoordinatorSet(address indexed coordinator);
    event Reserved(bytes32 indexed releaseKey, bytes32 indexed guid);
    event Released(bytes32 indexed releaseKey, bytes32 indexed guid, address recipient, uint256 amountLD);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param token_           Underlying ERC-20 token (e.g. USDT on Ethereum).
     * @param lzEndpoint_      LayerZero EndpointV2 address on this chain.
     * @param initialOwner_    OFT owner (passed to Ownable via OFTAdapter).
     * @param aggLayerBridge_  AgglayerBridge address on this chain.
     */
    constructor(
        address token_,
        address lzEndpoint_,
        address initialOwner_,
        address aggLayerBridge_
    ) OFTAdapter(token_, lzEndpoint_, initialOwner_) Ownable(initialOwner_) {
        _getStorage().aggLayerBridge = aggLayerBridge_;
    }

    // -------------------------------------------------------------------------
    // Owner-settable configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Configure or replace a route for a given destination endpoint ID.
     * @param dstEid  LayerZero destination endpoint ID.
     * @param policy  Route policy struct.
     */
    function setRoute(uint32 dstEid, LzRoutePolicy calldata policy) external onlyOwner {
        _getStorage().routes[dstEid] = policy;
        emit RouteSet(dstEid, policy);
    }

    /**
     * @notice Remove the route for a given destination endpoint ID.
     * @param dstEid  LayerZero destination endpoint ID.
     */
    function clearRoute(uint32 dstEid) external onlyOwner {
        delete _getStorage().routes[dstEid];
        emit RouteCleared(dstEid);
    }

    /**
     * @notice Set the coordinator address. Can only be called once (from zero).
     * @param coordinator  Address of the AggLayerDVNCoordinator.
     */
    function setCoordinator(address coordinator) external onlyOwner {
        OFTAdapterStorage storage $ = _getStorage();
        if ($.aggLayerDVNCoordinator != address(0)) revert CoordinatorAlreadySet();
        $.aggLayerDVNCoordinator = coordinator;
        emit CoordinatorSet(coordinator);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    function getRoute(uint32 dstEid) external view returns (LzRoutePolicy memory) {
        return _getStorage().routes[dstEid];
    }

    function aggLayerDVNCoordinator() external view returns (address) {
        return _getStorage().aggLayerDVNCoordinator;
    }

    function aggLayerBridge() external view returns (address) {
        return _getStorage().aggLayerBridge;
    }

    function isReserved(bytes32 releaseKey) external view returns (bool) {
        return _getStorage().reservations[releaseKey];
    }

    function isReleased(bytes32 releaseKey) external view returns (bool) {
        return _getStorage().released[releaseKey];
    }

    // -------------------------------------------------------------------------
    // Source path — override send()
    //
    // Design decision: we override the public send() rather than _debit() or
    // _buildMsgAndOptions() because:
    //   - _debit() does not have access to SendParam (no sendTo / composeMsg).
    //   - _buildMsgAndOptions() is also called by quoteSend() (view), so we
    //     cannot perform state changes there.
    //   - Overriding send() gives us atomic access to both the bridge call
    //     (needs leafIndex before bridgeAsset increments depositCount) and the
    //     AggLayerOFTPayloadV1 message wrapping without transient storage or
    //     reentrancy concerns.
    //   - For non-AggLayer routes we delegate to super.send() unchanged.
    // -------------------------------------------------------------------------

    /**
     * @notice Sends tokens cross-chain. Overrides OFTCore.send.
     *
     * For AggLayer-routed destinations:
     *   1. Validates slippage and dust-removes the amount.
     *   2. Records the current depositCount (= future leafIndex).
     *   3. Pulls tokens from the caller and approves the bridge.
     *   4. Calls bridgeAsset (increments depositCount and emits the deposit).
     *   5. Builds the standard OFT message, wraps it in AggLayerOFTPayloadV1.
     *   6. Sends the wrapped payload via _lzSend.
     *
     * For non-AggLayer routes: delegates entirely to super.send().
     */
    function send(
        SendParam calldata _sendParam,
        MessagingFee calldata _fee,
        address _refundAddress
    ) external payable virtual override returns (MessagingReceipt memory msgReceipt, OFTReceipt memory oftReceipt) {
        OFTAdapterStorage storage $ = _getStorage();
        LzRoutePolicy memory policy = $.routes[_sendParam.dstEid];

        // If no AggLayer route is configured for this dstEid, use the base OFT flow.
        // We cannot call super.send() directly because OFTCore.send is not overridden in
        // OFTAdapter, so we replicate the OFTCore.send logic inline.
        if (policy.dstOFTReceiver == address(0)) {
            (uint256 amountSentLD_, uint256 amountReceivedLD_) = _debit(
                msg.sender,
                _sendParam.amountLD,
                _sendParam.minAmountLD,
                _sendParam.dstEid
            );
            (bytes memory message_, bytes memory options_) = _buildMsgAndOptions(_sendParam, amountReceivedLD_);
            msgReceipt = _lzSend(_sendParam.dstEid, message_, options_, _fee, _refundAddress);
            oftReceipt = OFTReceipt(amountSentLD_, amountReceivedLD_);
            emit OFTSent(msgReceipt.guid, _sendParam.dstEid, msg.sender, amountSentLD_, amountReceivedLD_);
            return (msgReceipt, oftReceipt);
        }

        // --- AggLayer route ---

        // 1. Compute dust-free amounts (mirrors OFTCore._debitView)
        (uint256 amountSentLD, uint256 amountReceivedLD) = _debitView(
            _sendParam.amountLD,
            _sendParam.minAmountLD,
            _sendParam.dstEid
        );

        // 2. Read leafIndex BEFORE bridgeAsset (which increments depositCount).
        //    depositCount() is a public uint256 on DepositContract (base of AgglayerBridge)
        //    but is not in IAgglayerBridge, so we use a local cast.
        uint32 leafIndex;
        {
            // solhint-disable-next-line no-inline-assembly
            (bool ok, bytes memory data) = $.aggLayerBridge.staticcall(
                abi.encodeWithSignature("depositCount()")
            );
            require(ok, "depositCount() call failed");
            leafIndex = uint32(abi.decode(data, (uint256)));
        }

        // 3. Compute globalIndex using AggLayer bit-encoding.
        //    sourceBridgeNetwork == 0 means mainnet (flag bit 2**64).
        //    Any other value is treated as rollupIndex = sourceBridgeNetwork - 1.
        uint256 globalIndex;
        if (policy.sourceBridgeNetwork == 0) {
            // Mainnet flag: bit 64 set + leafIndex in lower bits
            globalIndex = (1 << 64) + uint256(leafIndex);
        } else {
            uint256 rollupIndex = uint256(policy.sourceBridgeNetwork) - 1;
            globalIndex = (rollupIndex << 32) + uint256(leafIndex);
        }

        // 4. Pull tokens from caller and approve bridge.
        IERC20(token()).safeTransferFrom(msg.sender, address(this), amountSentLD);
        IERC20(token()).safeIncreaseAllowance($.aggLayerBridge, amountSentLD);

        // 5. Call bridgeAsset. destinationAddress = dstOFTReceiver (the custody
        //    contract on the destination chain), NOT the end user's address.
        IAgglayerBridge($.aggLayerBridge).bridgeAsset(
            policy.destinationBridgeNetwork,
            policy.dstOFTReceiver,
            amountSentLD,
            policy.tokenSrc,
            false, // forceUpdateGlobalExitRoot — false for gas efficiency
            ""     // permitData — caller pre-approved us
        );

        // 6. Build the standard OFT message (sendTo = _sendParam.to, amountSD).
        (bytes memory oftMessage, ) = _buildMsgAndOptions(_sendParam, amountReceivedLD);

        // 7. Wrap in AggLayerOFTPayloadV1. The coordinator on the destination
        //    decodes this to match the bridge deposit to the LZ packet.
        bytes memory wrappedMessage = AggLayerOFTPayloadCodec.encode(oftMessage, globalIndex);

        // 8. Compute options for the wrapped message (re-use the ones already
        //    built by _buildMsgAndOptions by calling combineOptions directly).
        bytes memory options = combineOptions(_sendParam.dstEid, SEND, _sendParam.extraOptions);

        // 9. Send via LayerZero.
        msgReceipt = _lzSend(_sendParam.dstEid, wrappedMessage, options, _fee, _refundAddress);
        oftReceipt = OFTReceipt(amountSentLD, amountReceivedLD);

        emit OFTSent(msgReceipt.guid, _sendParam.dstEid, msg.sender, amountSentLD, amountReceivedLD);
    }

    // -------------------------------------------------------------------------
    // Source path — _debit (for non-AggLayer routes via super.send)
    // -------------------------------------------------------------------------

    // We do NOT override _debit here; the base OFTAdapter._debit is used for
    // non-AggLayer routes (standard lock behaviour).

    // -------------------------------------------------------------------------
    // Destination path — IAggLayerOFTReceiver
    // -------------------------------------------------------------------------

    /**
     * @notice Compute the release key that identifies a unique LZ packet.
     * @dev Must match the key computed in AggLayerDVNCoordinator._processReleaseKey.
     *      releaseKey = keccak256(abi.encode(
     *          srcEid, sender, nonce, address(this), guid, payloadHash
     *      ))
     *      where payloadHash = keccak256(abi.encodePacked(guid, message)).
     */
    function _computeReleaseKey(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message
    ) internal view returns (bytes32) {
        bytes32 payloadHash = keccak256(abi.encodePacked(guid, message));
        return keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(this),
                guid,
                payloadHash
            )
        );
    }

    /**
     * @inheritdoc IAggLayerOFTReceiver
     *
     * @dev Called by AggLayerDVNCoordinator.
     *      1. Validates caller is the coordinator.
     *      2. Decodes AggLayerOFTPayloadV1 from message.
     *      3. Validates globalIndex matches claim.globalIndex.
     *      4. Validates claim.destinationAddress == address(this).
     *      5. Checks reservation not already set.
     *      6. Calls IAgglayerBridge.claimAsset with all claim fields.
     *      7. Records the reservation.
     */
    function claimAndReserve(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim
    ) external override {
        OFTAdapterStorage storage $ = _getStorage();

        if (msg.sender != $.aggLayerDVNCoordinator) revert NotCoordinator(msg.sender);

        // Decode the wrapped payload to extract globalIndex.
        AggLayerOFTPayloadV1 memory payload = AggLayerOFTPayloadCodec.decode(message);

        // Validate globalIndex matches the claim.
        if (payload.globalIndex != claim.globalIndex) {
            revert GlobalIndexMismatch(claim.globalIndex, payload.globalIndex);
        }

        // Validate this contract is the intended destination.
        if (claim.destinationAddress != address(this)) {
            revert DestinationAddressMismatch(claim.destinationAddress, address(this));
        }

        // Compute and check release key.
        bytes32 releaseKey = _computeReleaseKey(origin, guid, message);
        if ($.reservations[releaseKey]) revert ReservationAlreadyExists(releaseKey);

        // Call claimAsset — this transfers tokens into this contract.
        IAgglayerBridge($.aggLayerBridge).claimAsset(
            claim.smtProofLocalExitRoot,
            claim.smtProofRollupExitRoot,
            claim.globalIndex,
            claim.mainnetExitRoot,
            claim.rollupExitRoot,
            claim.originNetwork,
            claim.originTokenAddress,
            claim.destinationNetwork,
            claim.destinationAddress,
            claim.amount,
            claim.metadata
        );

        // Record reservation.
        $.reservations[releaseKey] = true;
        emit Reserved(releaseKey, guid);
    }

    /**
     * @inheritdoc IAggLayerOFTReceiver
     *
     * @dev Called when the bridge claim was already processed externally
     *      (front-run path). Instead of calling claimAsset, verifies that
     *      the contract balance increased by at least claim.amount since the
     *      last recorded balance.
     */
    function reserveAfterClaim(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim
    ) external override {
        OFTAdapterStorage storage $ = _getStorage();

        if (msg.sender != $.aggLayerDVNCoordinator) revert NotCoordinator(msg.sender);

        // Decode the wrapped payload to extract globalIndex.
        AggLayerOFTPayloadV1 memory payload = AggLayerOFTPayloadCodec.decode(message);

        // Validate globalIndex matches the claim.
        if (payload.globalIndex != claim.globalIndex) {
            revert GlobalIndexMismatch(claim.globalIndex, payload.globalIndex);
        }

        // Validate this contract is the intended destination.
        if (claim.destinationAddress != address(this)) {
            revert DestinationAddressMismatch(claim.destinationAddress, address(this));
        }

        // Compute and check release key.
        bytes32 releaseKey = _computeReleaseKey(origin, guid, message);
        if ($.reservations[releaseKey]) revert ReservationAlreadyExists(releaseKey);

        // Verify balance delta instead of calling claimAsset.
        uint256 currentBalance = IERC20(token()).balanceOf(address(this));
        if (currentBalance - $.lastRecordedBalance < claim.amount) {
            revert InsufficientBalanceDelta(currentBalance, $.lastRecordedBalance, claim.amount);
        }
        $.lastRecordedBalance = currentBalance;

        // Record reservation.
        $.reservations[releaseKey] = true;
        emit Reserved(releaseKey, guid);
    }

    // -------------------------------------------------------------------------
    // Destination path — override _lzReceive
    //
    // Design decision: we override _lzReceive (not _credit) because _credit
    // does not receive the guid or raw message — both of which are needed to
    // compute the releaseKey and to decode the AggLayerOFTPayloadV1 wrapper.
    // -------------------------------------------------------------------------

    /**
     * @dev Overrides OFTCore._lzReceive to enforce the reservation gate.
     *
     * 1. Decodes AggLayerOFTPayloadV1 from the raw message.
     * 2. Computes the releaseKey and checks it is reserved but not yet released.
     * 3. Marks released.
     * 4. Decodes the inner OFT message (sendTo, amountSD).
     * 5. Transfers amountLD to the recipient.
     *
     * For non-AggLayer messages (magic != "ALO1"), delegates to super._lzReceive.
     */
    function _lzReceive(
        LzOrigin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal virtual override {
        // Detect AggLayer-wrapped messages by checking magic at the start.
        // AggLayerOFTPayloadCodec.encode uses flat abi.encode(magic, version, oftMessage, globalIndex),
        // so bytes4 magic (right-padded to 32 bytes) occupies bytes 0-3 of the encoded payload.
        bool isAggLayerMessage = (
            _message.length >= 32 &&
            _message[0] == 0x41 && // 'A'
            _message[1] == 0x4c && // 'L'
            _message[2] == 0x4f && // 'O'
            _message[3] == 0x31    // '1'
        );

        if (!isAggLayerMessage) {
            // Standard OFT message — delegate to base implementation.
            super._lzReceive(_origin, _guid, _message, _executor, _extraData);
            return;
        }

        // Build the local Origin struct (same fields as LzOrigin).
        Origin memory origin = Origin({
            srcEid: _origin.srcEid,
            sender: _origin.sender,
            nonce: _origin.nonce
        });

        // Compute releaseKey using the same formula as claimAndReserve.
        bytes32 payloadHash = keccak256(abi.encodePacked(_guid, _message));
        bytes32 releaseKey = keccak256(
            abi.encode(
                origin.srcEid,
                origin.sender,
                origin.nonce,
                address(this),
                _guid,
                payloadHash
            )
        );

        OFTAdapterStorage storage $ = _getStorage();

        // Enforce reservation gate.
        if (!$.reservations[releaseKey]) revert NoReservation(releaseKey);
        if ($.released[releaseKey]) revert AlreadyReleased(releaseKey);
        $.released[releaseKey] = true;

        // Decode the AggLayer payload to get the inner OFT message.
        AggLayerOFTPayloadV1 memory payload = AggLayerOFTPayloadCodec.decode(_message);

        // Decode inner OFT message: [bytes32 sendTo][uint64 amountSD][...]
        // OFTMsgCodec layout: first 32 bytes = sendTo, next 8 bytes = amountSD.
        bytes memory inner = payload.oftMessage;
        bytes32 sendToBytes32;
        uint64 amountSD;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sendToBytes32 := mload(add(inner, 32))
            // amountSD is the next 8 bytes (64 bits), stored in the high bits of a 32-byte word
            amountSD := shr(192, mload(add(inner, 64)))
        }
        uint256 amountLD = _toLD(amountSD);

        address recipient = sendToBytes32.bytes32ToAddress();

        // Transfer tokens to the recipient from this contract's custody.
        IERC20(token()).safeTransfer(recipient, amountLD);

        emit Released(releaseKey, _guid, recipient, amountLD);
        emit OFTReceived(_guid, _origin.srcEid, recipient, amountLD);
    }
}
