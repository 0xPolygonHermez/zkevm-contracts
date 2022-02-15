// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "../GlobalExitRootManagerL2.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks

 */
contract GlobalExitRootManagerL2Mock is GlobalExitRootManagerL2 {
    address public circuit;

    /**
     * @param _bridgeAddress Bridge contract address
     */
    constructor(address _bridgeAddress, address _circuit)
        GlobalExitRootManagerL2(_bridgeAddress)
    {
        circuit = _circuit;
    }

    /**
     * @notice Add a new globalExitRoot
     * @param globalExitRoot New global exit root
     */
    function setLastGlobalExitRoot(bytes32 globalExitRoot) public {
        require(
            msg.sender == circuit,
            "GlobalExitRootManager::setLastGlobalExitRoot: ONLY_CIRCUIT"
        );
        lastGlobalExitRootNum++;
        globalExitRootMap[lastGlobalExitRootNum] = globalExitRoot;
    }
}
