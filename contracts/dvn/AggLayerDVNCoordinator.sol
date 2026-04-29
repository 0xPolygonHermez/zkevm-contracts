// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts5/access/Ownable.sol";
import {IAggLayerDVNCoordinator} from "./IAggLayerDVNCoordinator.sol";
import {IAggLayerOFTReceiver, Origin, AggLayerClaim} from "./IAggLayerOFTReceiver.sol";
import {IReceiveUlnE2} from "./IReceiveUlnE2.sol";

/**
 * @title AggLayerDVNCoordinator
 * @notice Destination-chain coordinator that atomically combines an AggLayer
 *         bridge claim with a LayerZero ULN packet verification in one
 *         transaction.
 *
 * Flow (FINAL-PROPOSAL.md §4.2 and §10.3):
 *   1. Authorised worker calls `claimAndVerify`.
 *   2. Coordinator validates the packet header and computes releaseKey.
 *   3. claimAndReserve is called on the OFT receiver; if the claim was already
 *      processed by someone else the coordinator gracefully falls through to
 *      reserveAfterClaim (front-run path).
 *   4. IReceiveUlnE2.verify is called so LayerZero accepts the packet.
 *   5. releaseKey is marked processed to prevent double-verification.
 *
 * PoC simplifications:
 * - receiveLib is set at construction time (no dynamic OApp config lookup).
 * - dstEid validation in _validatePacketHeader is skipped — the coordinator
 *   validates srcEid, sender, and receiver (address(this)) from the packet
 *   header. dstEid is not stored because the DVN can only be deployed on the
 *   correct destination chain; any mismatch would cause verify() to revert
 *   inside the ReceiveUln302 anyway.
 */
contract AggLayerDVNCoordinator is Ownable, IAggLayerDVNCoordinator {
    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Address of the LayerZero ReceiveUln302 (or compatible) library.
    address public immutable receiveLib;

    /// @notice Address of the AggLayer OFT receiver on this chain.
    address public immutable aggLayerOFTReceiver;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Set of off-chain worker addresses permitted to call `claimAndVerify`.
    mapping(address => bool) public allowedWorkers;

    /// @notice Tracks release keys that have already been processed.
    mapping(bytes32 => bool) private _processed;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Raised when `claimAndVerify` is called by an un-allowlisted address.
    error UnauthorizedWorker(address worker);

    /// @notice Raised when the provided payloadHash does not match keccak256(guid ++ message).
    error PayloadHashMismatch(bytes32 computed, bytes32 provided);

    /// @notice Raised when the packet header fails structural validation.
    error PacketHeaderInvalid(string reason);

    /// @notice Raised when the same releaseKey is submitted a second time.
    error AlreadyProcessed(bytes32 releaseKey);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted after a successful claim + verify round-trip.
    event ClaimedAndVerified(bytes32 indexed releaseKey, bytes32 indexed guid, bytes32 payloadHash);

    /// @notice Emitted when the owner adds a worker to the allowlist.
    event WorkerAdded(address indexed worker);

    /// @notice Emitted when the owner removes a worker from the allowlist.
    event WorkerRemoved(address indexed worker);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner        Address that owns the contract immediately after deployment.
     * @param receiveLib_         Address of the LayerZero ReceiveUln302 library on this chain.
     * @param aggLayerOFTReceiver_ Address of the AggLayer OFT receiver on this chain.
     */
    constructor(
        address initialOwner,
        address receiveLib_,
        address aggLayerOFTReceiver_
    ) Ownable(initialOwner) {
        receiveLib = receiveLib_;
        aggLayerOFTReceiver = aggLayerOFTReceiver_;
    }

    // -------------------------------------------------------------------------
    // Worker allowlist (owner-only)
    // -------------------------------------------------------------------------

    /**
     * @notice Add an off-chain worker address to the allowlist.
     * @param worker Address to permit.
     */
    function addWorker(address worker) external onlyOwner {
        allowedWorkers[worker] = true;
        emit WorkerAdded(worker);
    }

    /**
     * @notice Remove an off-chain worker address from the allowlist.
     * @param worker Address to revoke.
     */
    function removeWorker(address worker) external onlyOwner {
        allowedWorkers[worker] = false;
        emit WorkerRemoved(worker);
    }

    // -------------------------------------------------------------------------
    // IAggLayerDVNCoordinator
    // -------------------------------------------------------------------------

    /**
     * @inheritdoc IAggLayerDVNCoordinator
     *
     * @dev Steps (FINAL-PROPOSAL.md §4.2 and §10.3):
     *   1. Authorised worker check.
     *   2. Recompute and validate payloadHash.
     *   3. Validate the 81-byte packetHeader (srcEid, sender, receiver).
     *   4. Compute releaseKey and check for double-processing.
     *   5. claimAndReserve — with AlreadyClaimed() fallthrough to reserveAfterClaim.
     *   6. IReceiveUlnE2.verify.
     *   7. Emit ClaimedAndVerified.
     */
    function claimAndVerify(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim,
        bytes calldata packetHeader,
        bytes32 payloadHash,
        uint64 confirmations
    ) external override {
        // 1. Authorised worker check
        if (!allowedWorkers[msg.sender]) revert UnauthorizedWorker(msg.sender);

        // 2. Recompute payloadHash and verify it matches the provided value
        bytes32 computedHash = keccak256(abi.encodePacked(guid, message));
        if (computedHash != payloadHash) revert PayloadHashMismatch(computedHash, payloadHash);

        // 3. Validate the 81-byte packet header
        _validatePacketHeader(packetHeader, origin);

        // 4. Compute releaseKey (FINAL-PROPOSAL.md §6)
        bytes32 releaseKey = keccak256(
            abi.encode(origin.srcEid, origin.sender, origin.nonce, address(this), guid, payloadHash)
        );

        // 5. Prevent double-processing
        if (_processed[releaseKey]) revert AlreadyProcessed(releaseKey);
        _processed[releaseKey] = true;

        // 6. Try claimAndReserve; on AlreadyClaimed() fall through to reserveAfterClaim
        try IAggLayerOFTReceiver(aggLayerOFTReceiver).claimAndReserve(origin, guid, message, claim) {
            // success — claim was not previously processed
        } catch (bytes memory revertData) {
            // AlreadyClaimed() selector = bytes4(keccak256("AlreadyClaimed()")) = 0x646cf558
            if (revertData.length == 4 && bytes4(revertData) == bytes4(keccak256("AlreadyClaimed()"))) {
                // Front-run path: bridge claim already processed; just reserve the LZ slot
                IAggLayerOFTReceiver(aggLayerOFTReceiver).reserveAfterClaim(origin, guid, message, claim);
            } else {
                // Any other revert bubbles up
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    revert(add(revertData, 32), mload(revertData))
                }
            }
        }

        // 7. Call ReceiveUln302.verify from address(this) — this contract must be
        //    registered as a DVN in the ULN config for the target OApp.
        IReceiveUlnE2(receiveLib).verify(packetHeader, payloadHash, confirmations);

        emit ClaimedAndVerified(releaseKey, guid, payloadHash);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Validates the 81-byte LayerZero packet header.
     *
     * Packet header layout (PacketV1Codec):
     *   [0:1]   version  (1 byte)
     *   [1:9]   nonce    (8 bytes, uint64 big-endian)
     *   [9:13]  srcEid   (4 bytes, uint32 big-endian)
     *   [13:45] sender   (32 bytes, bytes32)
     *   [45:49] dstEid   (4 bytes, uint32 big-endian)
     *   [49:81] receiver (32 bytes, bytes32)
     *
     * PoC note: dstEid is NOT checked here. The coordinator can only be
     * deployed on its intended destination chain; any dstEid mismatch would
     * cause IReceiveUlnE2.verify() to revert inside ReceiveUln302. Checking it
     * would require storing an extra constructor parameter for no additional
     * security in this PoC context.
     *
     * @param packetHeader Raw encoded packet header bytes.
     * @param origin       LayerZero origin metadata to validate against.
     */
    function _validatePacketHeader(bytes calldata packetHeader, Origin calldata origin) internal view {
        if (packetHeader.length != 81) revert PacketHeaderInvalid("length != 81");

        // srcEid: bytes[9:13]
        uint32 headerSrcEid = uint32(bytes4(packetHeader[9:13]));
        if (headerSrcEid != origin.srcEid) revert PacketHeaderInvalid("srcEid mismatch");

        // sender: bytes[13:45]
        bytes32 headerSender = bytes32(packetHeader[13:45]);
        if (headerSender != origin.sender) revert PacketHeaderInvalid("sender mismatch");

        // receiver: bytes[49:81] — must be address(this) left-padded to 32 bytes
        bytes32 headerReceiver = bytes32(packetHeader[49:81]);
        bytes32 expectedReceiver = bytes32(uint256(uint160(address(this))));
        if (headerReceiver != expectedReceiver) revert PacketHeaderInvalid("receiver mismatch");
    }
}
