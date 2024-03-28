// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import {PolygonAccessControlUpgradeable} from "./lib/PolygonAccessControlUpgradeable.sol";

/**
 * Contract responsible for managing the exit roots for the L2 and global exit roots
 * The special zkRom variables will be accessed and updated directly by the zkRom
 */
contract PolygonZkEVMGlobalExitRootL2 is PolygonAccessControlUpgradeable, IBasePolygonZkEVMGlobalExitRoot {
    bytes32 constant internal _GLOBAL_EXIT_ROOT_SETTER_ROLE = keccak256("GLOBAL_EXIT_ROOT_SETTER_ROLE");
    bytes32 constant internal _GLOBAL_EXIT_ROOT_SETTER_ROLE_ADMIN = keccak256("GLOBAL_EXIT_ROOT_SETTER_ROLE_ADMIN");

    // Store every global exit root: Root --> timestamp
    mapping(bytes32 => uint256) public globalExitRootMap;

    // Rollup exit root will be updated for every PolygonZkEVMBridge call
    bytes32 public lastRollupExitRoot;

    // PolygonZkEVM Bridge address
    address public immutable bridgeAddress;

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(address _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
        _setRoleAdmin(_GLOBAL_EXIT_ROOT_SETTER_ROLE, _GLOBAL_EXIT_ROOT_SETTER_ROLE_ADMIN);
        _grantRole(_GLOBAL_EXIT_ROOT_SETTER_ROLE_ADMIN, msg.sender);
        _disableInitializers();
    }

    /**
     * @notice Update the exit root of one of the networks and the global exit root
     * @param newRoot new exit tree root
     */
    function updateExitRoot(bytes32 newRoot) external {
        if (msg.sender != bridgeAddress) {
            revert OnlyAllowedContracts();
        }

        lastRollupExitRoot = newRoot;
    }

    function updateGlobalExitRoot(bytes32 _newRoot) external onlyRole(_GLOBAL_EXIT_ROOT_SETTER_ROLE) {
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
        }
    }
}
