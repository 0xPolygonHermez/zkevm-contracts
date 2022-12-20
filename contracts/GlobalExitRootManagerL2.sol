// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * Contract responsible for managing the exit roots for the L2 and global exit roots
 * The special circuit variables will be accesed and updated directly by the circuit
 */
contract GlobalExitRootManagerL2 {
    /////////////////////////////
    // Special circuit variables
    ////////////////////////////

    // Store every global exit root
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Rollup exit root, will be updated for every PolygonZKEVM Bridge call
    bytes32 public lastRollupExitRoot;

    ////////////////////
    // Regular variables
    ///////////////////

    // PolygonZKEVM Bridge address
    address public bridgeAddress;

    /**
     * @param _bridgeAddress PolygonZKEVMBridge contract address
     */
    constructor(address _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
    }

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(bytes32 newRoot) external {
        require(
            msg.sender == bridgeAddress,
            "GlobalExitRootManagerL2::updateExitRoot: ONLY_BRIDGE"
        );
        lastRollupExitRoot = newRoot;
    }
}
