// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts5/access/Ownable.sol";
import {ILayerZeroDVN, AssignJobParam} from "./ILayerZeroDVN.sol";

/**
 * @title AggLayerDVN
 * @notice Source-chain LayerZero DVN contract that fronts the AggLayer off-chain worker.
 *         Implements ILayerZeroDVN so LayerZero can assign verification jobs.
 *
 * PoC simplifications:
 * - Flat fee pricing (no dynamic gas oracle)
 * - Sender allowlist controls who can trigger job assignment
 * - Collected fees sit in contract balance until the owner withdraws them
 */
contract AggLayerDVN is Ownable, ILayerZeroDVN {
    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Flat fee charged per `assignJob` call (in wei). Zero means not yet configured.
    uint256 public flatFee;

    /// @notice Set of OFT/sender addresses permitted to call `assignJob`.
    mapping(address => bool) public allowedSenders;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Raised when `assignJob` is called but `flatFee` has not been set.
    error FlatFeeNotSet();

    /// @notice Raised when `assignJob` is called by a sender not in the allowlist.
    error UnauthorizedSender(address sender);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when the owner updates the flat fee.
    event FlatFeeSet(uint256 fee);

    /// @notice Emitted when the owner adds a sender to the allowlist.
    event SenderAdded(address sender);

    /// @notice Emitted when the owner removes a sender from the allowlist.
    event SenderRemoved(address sender);

    /// @notice Emitted when LayerZero assigns a verification job.
    event JobAssigned(
        bytes packetHeader,
        bytes32 payloadHash,
        uint32 dstEid,
        address sender,
        uint256 fee
    );

    /// @notice Emitted when the owner withdraws accumulated fees.
    event FeesWithdrawn(address to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param initialOwner Address that will own the contract immediately after deployment.
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    // -------------------------------------------------------------------------
    // Owner-only configuration
    // -------------------------------------------------------------------------

    /**
     * @notice Set the flat fee returned by `assignJob`.
     * @param fee_ New flat fee in wei. Must be non-zero to enable job assignment.
     */
    function setFlatFee(uint256 fee_) external onlyOwner {
        flatFee = fee_;
        emit FlatFeeSet(fee_);
    }

    /**
     * @notice Add an address to the sender allowlist.
     * @param sender Address to permit.
     */
    function addSender(address sender) external onlyOwner {
        allowedSenders[sender] = true;
        emit SenderAdded(sender);
    }

    /**
     * @notice Remove an address from the sender allowlist.
     * @param sender Address to revoke.
     */
    function removeSender(address sender) external onlyOwner {
        allowedSenders[sender] = false;
        emit SenderRemoved(sender);
    }

    // -------------------------------------------------------------------------
    // ILayerZeroDVN
    // -------------------------------------------------------------------------

    /**
     * @notice Called by LayerZero to assign a packet-verification job to this DVN.
     * @dev The caller must pass `msg.value == flatFee`. The fee is retained in the
     *      contract balance; the owner can withdraw it via `withdrawFees`.
     * @param _param Job parameters (destination EID, packet header, payload hash, etc.).
     * @param _options Unused in this PoC implementation.
     * @return fee The flat fee charged for this job (== `flatFee`).
     */
    function assignJob(
        AssignJobParam calldata _param,
        bytes calldata _options
    ) external payable override returns (uint256 fee) {
        if (flatFee == 0) revert FlatFeeNotSet();
        if (!allowedSenders[_param.sender]) revert UnauthorizedSender(_param.sender);

        fee = flatFee;

        emit JobAssigned(_param.packetHeader, _param.payloadHash, _param.dstEid, _param.sender, fee);
    }

    // -------------------------------------------------------------------------
    // Fee withdrawal
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraw accumulated fees to `to`.
     * @param to      Recipient of the withdrawn funds.
     * @param amount  Amount in wei to transfer.
     */
    function withdrawFees(address payable to, uint256 amount) external onlyOwner {
        emit FeesWithdrawn(to, amount);
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
