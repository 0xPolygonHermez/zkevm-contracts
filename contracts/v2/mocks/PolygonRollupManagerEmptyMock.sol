// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.24;
import "../PolygonRollupManager.sol";
import "../interfaces/IPolygonRollupBase.sol";
import "../../lib/EmergencyManager.sol";

/**
 * PolygonRollupManager used only to test conensus contracts
 */
contract PolygonRollupManagerEmptyMock is EmergencyManager {
    uint256 currentSequenceBlobs;

    bool acceptSequenceBlobs = true;

    function setAcceptSequenceBlobs(bool newAcceptSequenceBlobs) public {
        acceptSequenceBlobs = newAcceptSequenceBlobs;
    }

    function onSequence(
        uint128 zkGasLimitSequenced,
        uint64 blobsSequenced,
        bytes32 newAccInputHash
    ) external returns (uint64) {
        if (!acceptSequenceBlobs) {
            revert();
        }
        currentSequenceBlobs = currentSequenceBlobs + blobsSequenced;
        return uint64(currentSequenceBlobs);
    }

    function onVerifyBlobs(
        uint64 lastVerifiedSequenceNum,
        bytes32 newStateRoot,
        IPolygonRollupBase rollup
    ) external returns (uint64) {
        rollup.onVerifySequences(
            lastVerifiedSequenceNum,
            newStateRoot,
            msg.sender
        );
    }

    function getBatchFee() public view returns (uint256) {
        return 1;
    }

    function getForcedBatchFee() public view returns (uint256) {
        return 10;
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function activateEmergencyState() external {
        // activate emergency state on this contract
        super._activateEmergencyState();
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function lastDeactivatedEmergencyStateTimestamp()
        external
        returns (uint256)
    {
        return 0;
    }

    /**
     * @notice Function to deactivate emergency state on both PolygonZkEVM and PolygonZkEVMBridge contracts
     */
    function deactivateEmergencyState() external {
        // Deactivate emergency state on this contract
        super._deactivateEmergencyState();
    }
}
