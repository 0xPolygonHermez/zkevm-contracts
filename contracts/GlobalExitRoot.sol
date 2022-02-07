// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * This is totally a mock contract, there's just enough to test the proof of efficiency contract
 */
contract GlobalExitRoot is Ownable {
    // Rollup exit root, this will be updated every time a batch is verified
    bytes32 public lastRollupExitRoot;

    // Rollup exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root
    mapping(uint256 => bytes32) public globalExitRootMap;

    // Current global exit roots stored
    uint256 public lastGlobalExitRootNum;

    // Bridge address
    address public bridgeAddress;

    // Rollup contract address
    address public rollupAddress;

    /**
     * @dev Emitted when the the global exit root is updated
     */
    event UpdateGlobalExitRoot(bytes32 mainnetExitRoot, bytes32 rollupExitRoot);

    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress Bridge contract address
     */
    constructor(address _rollupAddress, address _bridgeAddress) {
        rollupAddress = _rollupAddress;
        bridgeAddress = _bridgeAddress;
    }

    /**
     * @notice Update the exit root of one of the networks and the globalExitRoot
     */
    function updateExitRoot(bytes32 newRoot) internal {
        require(
            msg.sender == rollupAddress || msg.sender == bridgeAddress,
            "Bridge::updateRollupExitRoot: ONLY_ALLOWED_CONTRACTS"
        );
        if (msg.sender == rollupAddress) {
            lastRollupExitRoot = newRoot;
        }
        if (msg.sender == bridgeAddress) {
            lastMainnetExitRoot = newRoot;
        }

        lastGlobalExitRootNum++;
        globalExitRootMap[lastGlobalExitRootNum] = keccak256(
            abi.encodePacked(lastMainnetExitRoot, lastRollupExitRoot)
        );

        emit UpdateGlobalExitRoot(lastMainnetExitRoot, lastRollupExitRoot);
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return globalExitRootMap[lastGlobalExitRootNum];
    }
}
