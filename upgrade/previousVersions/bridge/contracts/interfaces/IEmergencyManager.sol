// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IEmergencyManager {
    /**
     * @dev Thrown when emergency state is active, and the function requires otherwise
     */
    error OnlyNotEmergencyState();

    /**
     * @dev Thrown when emergency state is not active, and the function requires otherwise
     */
    error OnlyEmergencyState();

    /**
     * @dev Emitted when emergency state is activated
     */
    event EmergencyStateActivated();

    /**
     * @dev Emitted when emergency state is deactivated
     */
    event EmergencyStateDeactivated();

    /**
     * @notice Returns whether the emergency state is active
     */
    function isEmergencyState() external view returns (bool);
}
