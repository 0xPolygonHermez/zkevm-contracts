// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {IAggLayerOFTReceiver, Origin, AggLayerClaim} from "../IAggLayerOFTReceiver.sol";
import {IReceiveUlnE2} from "../IReceiveUlnE2.sol";

/**
 * @notice Happy-path mock OFT receiver for AggLayerDVNCoordinator tests.
 *         claimAndReserve and reserveAfterClaim both succeed silently.
 */
contract MockOFTReceiverHappy is IAggLayerOFTReceiver {
    bool public claimAndReserveCalled;
    bool public reserveAfterClaimCalled;

    function claimAndReserve(
        Origin calldata,
        bytes32,
        bytes calldata,
        AggLayerClaim calldata
    ) external override {
        claimAndReserveCalled = true;
    }

    function reserveAfterClaim(
        Origin calldata,
        bytes32,
        bytes calldata,
        AggLayerClaim calldata
    ) external override {
        reserveAfterClaimCalled = true;
    }
}

/**
 * @notice Front-run mock OFT receiver for AggLayerDVNCoordinator tests.
 *         claimAndReserve reverts with AlreadyClaimed(); reserveAfterClaim succeeds.
 */
contract MockOFTReceiverAlreadyClaimed is IAggLayerOFTReceiver {
    // solhint-disable-next-line custom-errors
    error AlreadyClaimed();

    bool public reserveAfterClaimCalled;

    function claimAndReserve(
        Origin calldata,
        bytes32,
        bytes calldata,
        AggLayerClaim calldata
    ) external pure override {
        revert AlreadyClaimed();
    }

    function reserveAfterClaim(
        Origin calldata,
        bytes32,
        bytes calldata,
        AggLayerClaim calldata
    ) external override {
        reserveAfterClaimCalled = true;
    }
}

/**
 * @notice Mock ReceiveUln302 for AggLayerDVNCoordinator tests.
 *         verify() records its arguments and succeeds silently.
 */
contract MockReceiveLib is IReceiveUlnE2 {
    bool public verifyCalled;
    bytes public lastPacketHeader;
    bytes32 public lastPayloadHash;
    uint64 public lastConfirmations;

    function verify(
        bytes calldata _packetHeader,
        bytes32 _payloadHash,
        uint64 _confirmations
    ) external override {
        verifyCalled = true;
        lastPacketHeader = _packetHeader;
        lastPayloadHash = _payloadHash;
        lastConfirmations = _confirmations;
    }
}
