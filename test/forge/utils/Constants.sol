// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

/**
 * @title Constants
 * @dev Contains all constants used across foundry tests
 */
library Constants {
    // ===== Test Addresses =====
    address public constant GER_MANAGER_ADDRESS = 0xA00000000000000000000000000000000000000A;
    address public constant POL_TOKEN_ADDRESS = 0xB00000000000000000000000000000000000000B;
    address public constant ROLLUP_MANAGER_ADDRESS = 0xC00000000000000000000000000000000000000C;
    address public constant BRIDGE_ADDRESS = 0xD00000000000000000000000000000000000000D;
    address public constant AGGLAYER_GATEWAY_ADDRESS = 0xe00000000000000000000000000000000000000E;

    // ===== Timelock Constants =====
    uint256 public constant TIMELOCK_MIN_DELAY = 0; // 0 seconds

    // ===== Test Configuration Constants =====
    string public constant GENESIS_CONFIG_NAME = "opsuccinct_genesis";

    // ===== Salt for deterministic deployments =====
    bytes32 public constant DEFAULT_SALT = keccak256("DEFAULT_SALT");
}
