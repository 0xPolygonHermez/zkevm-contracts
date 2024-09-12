// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import {PolygonAccessControlUpgradeable} from "../lib/PolygonAccessControlUpgradeable.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is
    PolygonAccessControlUpgradeable,
    IBasePolygonZkEVMGlobalExitRoot
{
    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Rollup exit root will be updated for every PolygonZkEVMBridge call
    bytes32 public lastRollupExitRoot;

    // PolygonZkEVM Bridge address
    address public immutable bridgeAddress;

    /**
     * @dev Emitted when a new global exit root is inserted
     */
    event InsertGlobalExitRoot(
        bytes32 indexed newGlobalExitRoot
    );

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(address _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
        _disableInitializers();
    }

    /**
     * @notice Only allows a function to be callable if its called by coinbase (trusted sequencer in sovereign chains)
     */
    modifier onlyTrustedSequencer() {
        if (block.coinbase != msg.sender) {
            revert OnlyTrustedSequencer();
        }
        _;
    }

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(bytes32 newRoot) external onlyTrustedSequencer {
        lastRollupExitRoot = newRoot;
    }

    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyTrustedSequencer {
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
            emit InsertGlobalExitRoot(
                _newRoot
            );
        }
    }
}
