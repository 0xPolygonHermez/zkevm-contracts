// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "./interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "./lib/PolygonZkEVMGlobalExitRootBaseStorage.sol";
import "../lib/GlobalExitRootLib.sol";
import "./lib/DepositContractBase.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract PolygonZkEVMGlobalExitRootV2 is
    PolygonZkEVMGlobalExitRootBaseStorage,
    DepositContractBase
{
    // PolygonZkEVMBridge address
    address public immutable bridgeAddress;

    // Rollup manager contract address
    address public immutable rollupManager;

    /**
     * @dev Emitted when the global exit root is updated
     */
    event UpdateL1InfoTree(
        bytes32 indexed mainnetExitRoot,
        bytes32 indexed rollupExitRoot
    );

    /**
     * @param _rollupManager Rollup manager contract address
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
        bytes32 cacheLastRollupExitRoot;
        bytes32 cacheLastMainnetExitRoot;

        if (msg.sender == bridgeAddress) {
            lastMainnetExitRoot = newRoot;
            cacheLastMainnetExitRoot = newRoot;
            cacheLastRollupExitRoot = lastRollupExitRoot;
        } else if (msg.sender == rollupManager) {
            lastRollupExitRoot = newRoot;
            cacheLastRollupExitRoot = newRoot;
            cacheLastMainnetExitRoot = lastMainnetExitRoot;
        } else {
            revert OnlyAllowedContracts();
        }

        bytes32 newGlobalExitRoot = GlobalExitRootLib.calculateGlobalExitRoot(
            cacheLastMainnetExitRoot,
            cacheLastRollupExitRoot
        );

        // If it already exists, do not modify the blockhash
        if (globalExitRootMap[newGlobalExitRoot] == 0) {
            uint256 lastBlockHash = uint256(blockhash(block.number - 1));
            globalExitRootMap[newGlobalExitRoot] = lastBlockHash;

            // save new leaf in L1InfoTree
            _addLeaf(
                getLeafValue(
                    newGlobalExitRoot,
                    lastBlockHash,
                    uint64(block.timestamp)
                )
            );

            emit UpdateL1InfoTree(
                cacheLastMainnetExitRoot,
                cacheLastRollupExitRoot
            );
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
     * @notice Computes and returns the merkle root of the L1InfoTree
     */
    function getRoot()
        public
        view
        override(DepositContractBase, IPolygonZkEVMGlobalExitRootV2)
        returns (bytes32)
    {
        return super.getRoot();
    }

    /**
     * @notice Given the leaf data returns the leaf hash
     * @param newGlobalExitRoot Last global exit root
     * @param lastBlockHash Last accesible block hash
     * @param timestamp Ethereum timestamp in seconds
     */
    function getLeafValue(
        bytes32 newGlobalExitRoot,
        uint256 lastBlockHash,
        uint64 timestamp
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(newGlobalExitRoot, lastBlockHash, timestamp)
            );
    }
}
