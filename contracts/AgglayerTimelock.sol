// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts4/governance/TimelockController.sol";
import "./interfaces/IEmergencyManager.sol";

/**
 * @dev Contract module which acts as a timelocked controller.
 * This gives time for users of the controlled contract to exit before a potentially dangerous maintenance operation is applied.
 * If emergency mode of the Agglayer system is active, this timelock has no delay.
 */
contract AgglayerTimelock is TimelockController {
    // AgglayerManager address. Used to check if the system is in emergency state.
    IEmergencyManager public immutable agglayerManager;

    /**
     * @notice Constructor of the timelock
     * @param minDelay initial minimum delay for operations
     * @param proposers accounts to be granted proposer and canceller roles
     * @param executors accounts to be granted executor role
     * @param admin optional account to be granted admin role; disable with zero address
     * @param _agglayerManager AgglayerManager address
     **/
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin,
        IEmergencyManager _agglayerManager
    ) TimelockController(minDelay, proposers, executors, admin) {
        agglayerManager = _agglayerManager;
    }

    /**
     * @dev Returns the minimum delay for an operation to become valid.
     *
     * This value can be changed by executing an operation that calls `updateDelay`.
     * If the Agglayer system is in emergency state, the minDelay will be 0 instead.
     */
    function getMinDelay() public view override returns (uint256 duration) {
        if (
            address(agglayerManager) != address(0) &&
            agglayerManager.isEmergencyState()
        ) {
            return 0;
        } else {
            return super.getMinDelay();
        }
    }
}
