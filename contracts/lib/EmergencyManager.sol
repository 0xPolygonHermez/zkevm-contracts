// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

/**
 * @dev Contract helper responsible to manage the emergency state
 */
contract EmergencyManager {
    // Indicates wheather the emergency state is active or not
    bool public isEmergencyState;

    /**
     * @dev Emitted when emergency state is activated
     */
    event EmergencyStateActivated();

    /**
     * @dev Emitted when emergency state is deactivated
     */
    event EmergencyStateDeactivated();

    /**
     * @notice Only allows a function to be callable if emergency state is unactive
     */
    modifier ifNotEmergencyState() {
        require(
            !isEmergencyState,
            "EmergencyManager::ifNotEmergencyState: only if not emergency state"
        );
        _;
    }

    /**
     * @notice Only allows a function to be callable if emergency state is active
     */
    modifier ifEmergencyState() {
        require(
            isEmergencyState,
            "EmergencyManager::ifEmergencyState: only if emergency state"
        );
        _;
    }

    /**
     * @notice Activate emergency state
     */
    function _activateEmergencyState() internal virtual ifNotEmergencyState {
        isEmergencyState = true;
        emit EmergencyStateActivated();
    }

    /**
     * @notice Deactivate emergency state
     */
    function _deactivateEmergencyState() internal virtual ifEmergencyState {
        isEmergencyState = false;
        emit EmergencyStateDeactivated();
    }
}
