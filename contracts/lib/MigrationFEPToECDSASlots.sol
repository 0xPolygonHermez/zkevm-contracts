// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../aggchains/AggchainFEP.sol";

/**
 * This contract is used to migrate from FEP to ECDSA slots. It contains the slots that are present in the FEP
 * contract that are not present in the ECDSA one.
 */
abstract contract MigrationFEPToECDSASlots {
    AggchainFEP.OutputProposal[] internal l2Outputs;
    uint256 public startingBlockNumber;
    uint256 public startingTimestamp;
    uint256 public submissionInterval;
    uint256 public l2BlockTime;
    bytes32 public aggregationVkey;
    bytes32 public rangeVkeyCommitment;
    bytes32 public rollupConfigHash;
    bool public optimisticMode;
    address public optimisticModeManager;
    address public pendingOptimisticModeManager;
    mapping(bytes32 => AggchainFEP.OpSuccinctConfig) public opSuccinctConfigs;
    bytes32 public selectedOpSuccinctConfigName;
}
