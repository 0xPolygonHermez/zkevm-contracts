// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;
import "./interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";

/**
 * Contract responsible for managing the exit roots for the L2 and global exit roots
 * The special circuit variables will be accessed and updated directly by the circuit
 */
contract PolygonZkEVMGlobalExitRootL2 is IBasePolygonZkEVMGlobalExitRoot {
    /////////////////////////////
    // Special circuit variables
    ////////////////////////////

    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Rollup exit root will be updated for every PolygonZkEVMBridge call
    bytes32 public lastRollupExitRoot;

    ////////////////////
    // Regular variables
    ///////////////////

    // PolygonZkEVM Bridge address
    address public immutable bridgeAddress;

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
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
            "PolygonZkEVMGlobalExitRootL2::updateExitRoot: Only PolygonZkEVMBridge"
        );
        lastRollupExitRoot = newRoot;
    }
}
