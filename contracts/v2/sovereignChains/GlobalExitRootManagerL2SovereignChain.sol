// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import {PolygonAccessControlUpgradeable} from "../lib/PolygonAccessControlUpgradeable.sol";
import "../PolygonZkEVMGlobalExitRootV2.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is PolygonZkEVMGlobalExitRootV2 {
    /**
     * @dev Emitted when a new global exit root is inserted
     */
    event InsertGlobalExitRoot(bytes32 indexed newGlobalExitRoot);

    /**
     * @notice Only allows a function to be callable if its called by coinbase (trusted sequencer in sovereign chains)
     */
    modifier onlyCoinbase() {
        if (block.coinbase != msg.sender) {
            revert OnlyCoinbase();
        }
        _;
    }

    /**
     * @notice Only allows a function to be callable by the bride contract
     */
    modifier onlyBridgeAddress() {
        if (msg.sender != bridgeAddress) {
            revert OnlyAllowedContracts();
        }
        _;
    }

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _rollupManager,
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootV2(_rollupManager, _bridgeAddress) {}

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(
        bytes32 newRoot
    ) external override onlyBridgeAddress {
        lastRollupExitRoot = newRoot;
    }

    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyCoinbase {
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
            emit InsertGlobalExitRoot(_newRoot);
        }
    }
}
