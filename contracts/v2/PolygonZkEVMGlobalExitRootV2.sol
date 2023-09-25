// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IPolygonZkEVMGlobalExitRoot.sol";
import "../lib/GlobalExitRootLib.sol";
import "../lib/DepositContractLib.sol";

// TODO it is requierde a special ugpradbility for this contract since overlap storage slots
// This means that the lastRollupExitRoot and the lastMainnetExitRoot must be copei using assembly form prv version

// another and seems better approach will be to define a contract base which will contain tthe same slots

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract PolygonZkEVMGlobalExitRootV2 is
    IPolygonZkEVMGlobalExitRoot,
    DepositContractLib
{
    // PolygonZkEVMBridge address
    address public immutable bridgeAddress;

    // Rollup manager contract address
    address public immutable rollupManager;

    // Rollup root, contains all exit roots of all rollups
    bytes32 public lastRollupExitRoot;

    // Mainnet exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public historicGlobalExitRootSnapshots;

    /**
     * @dev Emitted when the global exit root is updated
     */
    event UpdateGlobalExitRoot(
        bytes32 indexed mainnetExitRoot,
        bytes32 indexed rollupExitRoot
    );

    /**
     * @dev Emitted when a snapshot of the historic global exit root is taken
     */
    event HistoricGlobalExitRootSnapshot(
        uint256 indexed depositCount,
        bytes32 indexed historicGlobalExitRoot
    );

    /**
     * @param _rollupManager Rollup contract address
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(address _rollupManager, address _bridgeAddress) {
        rollupManager = _rollupManager;
        bridgeAddress = _bridgeAddress;
    }

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(bytes32 newRoot) external {
        // Store storage variables into temporal variables since will be used multiple times
        bytes32 cacheLastRollupExitRoot = lastRollupExitRoot;
        bytes32 cacheLastMainnetExitRoot = lastMainnetExitRoot;

        if (msg.sender == bridgeAddress) {
            lastMainnetExitRoot = newRoot;
            cacheLastMainnetExitRoot = newRoot;
        } else if (msg.sender == rollupManager) {
            lastRollupExitRoot = newRoot;
            cacheLastRollupExitRoot = newRoot;
        } else {
            revert OnlyAllowedContracts();
        }

        bytes32 newGlobalExitRoot = GlobalExitRootLib.calculateGlobalExitRoot(
            cacheLastMainnetExitRoot,
            cacheLastRollupExitRoot
        );

        // If it already exists, do not modify the timestamp
        if (globalExitRootMap[newGlobalExitRoot] == 0) {
            globalExitRootMap[newGlobalExitRoot] = block.timestamp;
            emit UpdateGlobalExitRoot(
                cacheLastMainnetExitRoot,
                cacheLastRollupExitRoot
            );

            // Update the historical roots
            _addLeaf(newGlobalExitRoot);
        }
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return
            GlobalExitRootLib.calculateGlobalExitRoot(
                lastMainnetExitRoot,
                lastRollupExitRoot
            );
    }

    /**
     * @notice Computes and returns the merkle root
     */
    function getRoot()
        public
        view
        override(DepositContractLib, IPolygonZkEVMGlobalExitRoot)
        returns (bytes32)
    {
        return super.getRoot();
    }

    /**
     * @notice Computes and returns the merkle root
     */
    function takeHistoricGlobalExitRootSnapshot() public {
        bytes32 currentHistoricGlobalExitRoot = getRoot();
        if (
            historicGlobalExitRootSnapshots[currentHistoricGlobalExitRoot] == 0
        ) {
            historicGlobalExitRootSnapshots[
                currentHistoricGlobalExitRoot
            ] = block.timestamp;

            emit HistoricGlobalExitRootSnapshot(
                depositCount,
                currentHistoricGlobalExitRoot
            );
        }
    }
}
