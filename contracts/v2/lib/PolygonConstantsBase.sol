// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

/**
 * This contract will contain the constants used across different contracts
 */
contract PolygonConstantsBase {
    // If the system a does not verify a batch inside this time window, the contract enters in emergency mode
    uint64 internal constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Zk gas payed per batch, checked on the zkrom
    uint64 public constant ZK_GAS_LIMIT_BATCH = 100_000_000;
}
