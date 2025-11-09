// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseLegacyAgglayerGER.sol";

interface IInitializerAgglayerBridgeL2 {
    /**
     * @notice Initialize the AgglayerBridgeL2 contract
     * @param _networkID The network ID of the chain
     * @param _gasTokenAddress The address of the gas token
     * @param _gasTokenNetwork The network ID of the gas token
     * @param _globalExitRootManager The address of the global exit root manager
     * @param _polygonRollupManager The address of the polygon rollup manager
     * @param _gasTokenMetadata The metadata of the gas token
     * @param _bridgeManager The address of the bridge manager
     * @param sovereignWETHAddress The address of the sovereign WETH token
     * @param _sovereignWETHAddressIsNotMintable The flag to indicate if the sovereign WETH token is not mintable
     * @param _emergencyBridgePauser The address of the emergency bridge pauser
     * @param _emergencyBridgeUnpauser The address of the emergency bridge unpauser
     * @param _proxiedTokensManager The address of the proxied tokens manager
     */
    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBaseLegacyAgglayerGER _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) external;
}
