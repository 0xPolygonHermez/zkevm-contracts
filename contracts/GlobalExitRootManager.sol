// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

import "./interfaces/IGlobalExitRootManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract GlobalExitRootManager is IGlobalExitRootManager, Initializable {
    // Rollup exit root, this will be updated every time a batch is verified
    bytes32 public lastRollupExitRoot;

    // Mainnet exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root: Root --> rootNum
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Current global exit roots stored
    uint256 public lastGlobalExitRootNum;

    // Bridge address
    address public bridgeAddress;

    // Rollup contract address
    address public rollupAddress;

    /**
     * @dev Emitted when the the global exit root is updated
     */
    event UpdateGlobalExitRoot(
        uint256 indexed globalExitRootNum,
        bytes32 indexed mainnetExitRoot,
        bytes32 indexed rollupExitRoot
    );

    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress Bridge contract address
     */
    function initialize(address _rollupAddress, address _bridgeAddress)
        public
        initializer
    {
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
            "GlobalExitRootManager::updateExitRoot: ONLY_ALLOWED_CONTRACTS"
        );
        if (msg.sender == rollupAddress) {
            lastRollupExitRoot = newRoot;
        }
        if (msg.sender == bridgeAddress) {
            lastMainnetExitRoot = newRoot;
        }

        lastGlobalExitRootNum++;

        bytes32 newGlobalExitRoot = keccak256(
            abi.encodePacked(lastMainnetExitRoot, lastRollupExitRoot)
        );
        globalExitRootMap[newGlobalExitRoot] = lastGlobalExitRootNum;

        emit UpdateGlobalExitRoot(
            lastGlobalExitRootNum,
            lastMainnetExitRoot,
            lastRollupExitRoot
        );
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
