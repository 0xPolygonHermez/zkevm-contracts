// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IGlobalExitRootManager.sol";

/**
 * Contract responsible for managing the exit roots for the L2 and global exit roots
 * The special circuit variables will be accesed and updated directly by the circuit
 */
contract GlobalExitRootManagerL2 is IGlobalExitRootManager {
    /////////////////////////////
    // Special circuit variables
    ////////////////////////////

    // Store every global exit root
    mapping(uint256 => bytes32) public globalExitRootMap;

    // Current global exit roots stored
    uint256 public lastGlobalExitRootNum;

    ////////////////////
    // Regular variables
    ///////////////////
    // Rollup exit root,will be updated for every bridge call
    bytes32 public lastRollupExitRoot;

    // Bridge address
    address public bridgeAddress;

    /**
     * @param _bridgeAddress Bridge contract address
     */
    constructor(address _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
    }

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     */
    function updateExitRoot(bytes32 newRoot) external {
        require(
            msg.sender == bridgeAddress,
            "GlobalExitRootManager::updateExitRoot: ONLY_BRIDGE"
        );
        lastRollupExitRoot = newRoot;
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return globalExitRootMap[lastGlobalExitRootNum];
    }
}
