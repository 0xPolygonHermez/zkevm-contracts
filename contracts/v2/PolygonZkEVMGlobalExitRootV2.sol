// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.24;

import "./interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "./lib/PolygonZkEVMGlobalExitRootBaseStorage.sol";
import "../lib/GlobalExitRootLib.sol";
import "./lib/DepositContractBase.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract PolygonZkEVMGlobalExitRootV2 is
    PolygonZkEVMGlobalExitRootBaseStorage,
    DepositContractBase,
    Initializable
{
    // PolygonZkEVMBridge address
    address public immutable bridgeAddress;

    // Rollup manager contract address
    address public immutable rollupManager;

    // Store every l1InfoLeaf
    mapping(uint256 depositCount => bytes32 l1InfoLeafHash)
        public l1InfoLeafMap;

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
     * @notice Reset the deposit tree since will be replace by a recursive one
     */
    function initialize() external virtual initializer {
        for (uint256 i = 0; i < _DEPOSIT_CONTRACT_TREE_DEPTH; i++) {
            delete _branch[i];
        }
        depositCount = 0;
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
            bytes32 newLeaf = getLeafValue(
                getL1InfoTreeHash(
                    newGlobalExitRoot,
                    lastBlockHash,
                    uint64(block.timestamp)
                ),
                getRoot()
            );

            l1InfoLeafMap[depositCount] = newLeaf;
            _addLeaf(newLeaf);

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
    function getL1InfoTreeHash(
        bytes32 newGlobalExitRoot,
        uint256 lastBlockHash,
        uint64 timestamp
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(newGlobalExitRoot, lastBlockHash, timestamp)
            );
    }

    /**
     * @notice Given the leaf data returns the leaf hash
     * @param l1InfoRoot Last global exit root
     * @param l1InfoTreeHash Last accesible block hash
     */
    function getLeafValue(
        bytes32 l1InfoRoot,
        bytes32 l1InfoTreeHash
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(l1InfoRoot, l1InfoTreeHash));
    }
}
