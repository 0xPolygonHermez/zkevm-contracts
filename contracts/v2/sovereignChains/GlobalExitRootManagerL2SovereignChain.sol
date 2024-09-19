// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../../PolygonZkEVMGlobalExitRootL2.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is PolygonZkEVMGlobalExitRootL2 {
    /**
     * @dev Emitted when a new global exit root is inserted
     */
    event InsertGlobalExitRoot(bytes32 indexed newGlobalExitRoot);

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2( _bridgeAddress) {}

    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external {
        // Only allowed to be called by coinbase
         if (block.coinbase != msg.sender) {
            revert OnlyCoinbase();
        }
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
            emit InsertGlobalExitRoot(_newRoot);
        }
    }
}
