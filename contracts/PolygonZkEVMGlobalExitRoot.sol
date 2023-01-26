// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

import "./interfaces/IPolygonZkEVMGlobalExitRoot.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract PolygonZkEVMGlobalExitRoot is
    IPolygonZkEVMGlobalExitRoot
{
    // PolygonZkEVMBridge address
    address public immutable bridgeAddress;

    // Rollup contract address
    address public immutable rollupAddress;

    // Rollup exit root, this will be updated every time a batch is verified
    bytes32 public lastRollupExitRoot;

    // Mainnet exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public globalExitRootMap;

    /**
     * @dev Emitted when the the global exit root is updated
     */
    event UpdateGlobalExitRoot(
        bytes32 indexed mainnetExitRoot,
        bytes32 indexed rollupExitRoot
    );

    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor( 
        address _rollupAddress,
        address _bridgeAddress
    ) {
        rollupAddress = _rollupAddress;
        bridgeAddress = _bridgeAddress;
    }
    
    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(bytes32 newRoot) external {
        require(
            msg.sender == rollupAddress || msg.sender == bridgeAddress,
            "PolygonZkEVMGlobalExitRoot::updateExitRoot: Only allowed contracts"
        );

        // Store storage variables into temporal variables since will be used multiple times
        bytes32 cacheLastRollupExitRoot = lastRollupExitRoot;
	    bytes32 cacheLastMainnetExitRoot = lastMainnetExitRoot;

        if (msg.sender == rollupAddress) {
            lastRollupExitRoot = newRoot;
            cacheLastRollupExitRoot = newRoot;
        }
        if (msg.sender == bridgeAddress) {
            lastMainnetExitRoot = newRoot;
            cacheLastMainnetExitRoot = newRoot;
        }

        bytes32 newGlobalExitRoot = keccak256(
            abi.encodePacked(cacheLastMainnetExitRoot, cacheLastRollupExitRoot)
        );

        // If it already exists, do not modify the timestamp
        if (globalExitRootMap[newGlobalExitRoot] == 0) {
            globalExitRootMap[newGlobalExitRoot] = block.timestamp;
            emit UpdateGlobalExitRoot(cacheLastMainnetExitRoot, cacheLastRollupExitRoot);
        }
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(lastMainnetExitRoot, lastRollupExitRoot)
            );
    }
}
