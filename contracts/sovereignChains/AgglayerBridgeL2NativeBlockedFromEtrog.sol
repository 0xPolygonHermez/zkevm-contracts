// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./AgglayerBridgeL2FromEtrog.sol";

/**
 * PolygonZkEVMBridge that will be deployed on Ethereum and all Polygon rollups
 * Contract responsible to manage the token interactions with other networks
 */
contract AgglayerBridgeL2NativeBlockedFromEtrog is AgglayerBridgeL2FromEtrog {
    error NativeTokenBridgeBlocked();

    /**
     * @inheritdoc AgglayerBridge
     * @dev This override does NOT apply `nonReentrant` or `ifNotEmergencyState` modifiers itself
     * because `super.bridgeAsset` already enforces both. Applying them here would cause the
     * reentrancy guard to revert on the nested `super` call (double entry into `nonReentrant`).
     */
    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) public payable virtual override(AgglayerBridge, IAgglayerBridge) {
        if (token == address(0) && address(WETHToken) != address(0)) {
            revert NativeTokenBridgeBlocked();
        }
        super.bridgeAsset(
            destinationNetwork,
            destinationAddress,
            amount,
            token,
            forceUpdateGlobalExitRoot,
            permitData
        );
    }

    /**
     * @inheritdoc AgglayerBridge
     * @dev This override does NOT apply `nonReentrant` or `ifNotEmergencyState` modifiers itself
     * because `super.claimAsset` already enforces both. Applying them here would cause the
     * reentrancy guard to revert on the nested `super` call (double entry into `nonReentrant`).
     */
    function claimAsset(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) public virtual override(AgglayerBridge, IAgglayerBridge) {
        if (
            originTokenAddress == gasTokenAddress &&
            gasTokenNetwork == originNetwork &&
            address(WETHToken) != address(0)
        ) {
            revert NativeTokenBridgeBlocked();
        }
        super.claimAsset(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );
    }

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure virtual override returns (string memory) {
        return "v1.3.0-blockGasToken";
    }
}
