// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

/**
 * This contract will contain the constants used across different contracts
 */
contract PolygonConstantsBase {
    // If the system a does not verify a batch inside this time window, the contract enters in emergency mode
    uint64 internal constant _HALT_AGGREGATION_TIMEOUT = 1 weeks;

    // Maximum batches that can be verified in one call. It depends on our current metrics
    // This should be a protection against someone that tries to generate huge chunk of invalid batches, and we can't prove otherwise before the pending timeout expires
    uint64 internal constant _MAX_VERIFY_BATCHES = 1000;
}
