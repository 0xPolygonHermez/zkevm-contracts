// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./AgglayerBridgeL2.sol";
import {ITokenWrappedBridgeUpgradeable} from "../interfaces/ITokenWrappedBridgeUpgradeable.sol";

/**
 * @title AgglayerBridgeL2FromEtrog
 * @notice Upgrade contract for migrating from the Etrog bridge implementation to AgglayerBridgeL2.
 *         This contract provides a specialized initialization function (`initializeFromEtrog`) that
 *         preserves existing bridge state while setting up new parameters required by AgglayerBridgeL2,
 *         including bridge manager, emergency roles, proxied tokens manager, and Local Balance Tree (LBT) initialization.
 *         The standard `initialize` function is disabled to prevent accidental re-initialization.
 */
contract AgglayerBridgeL2FromEtrog is AgglayerBridgeL2 {
    /**
     * @dev Thrown when one of the initialization parameters that must be 0 has already been initialized
     */
    error ParameterAlreadyInitialized();

    /**
     * @notice Override the function to prevent the contract from being initialized with this initializer
     */
    function initialize(
        uint32, // _networkID
        address, // _gasTokenAddress
        uint32, // _gasTokenNetwork
        IBaseLegacyAgglayerGER, // _globalExitRootManager
        address, // _polygonRollupManager
        bytes memory, // _gasTokenMetadata
        address, // _bridgeManager
        address, // _sovereignWETHAddress
        bool, // _sovereignWETHAddressIsNotMintable
        address, // _emergencyBridgePauser
        address, // _emergencyBridgeUnpauser
        address // _proxiedTokensManager
    ) public virtual override(AgglayerBridgeL2) initializer {
        revert InvalidInitializeFunction();
    }

    /**
     * @dev initializer function to set the initial values when the contract is upgraded from the Etrog version
     * @param _bridgeManager bridge manager address
     * @param _emergencyBridgePauser emergency bridge pauser address, allowed to be zero if the chain wants to disable the feature to stop the bridge
     * @param _emergencyBridgeUnpauser emergency bridge unpauser address, allowed to be zero if the chain wants to disable the feature to unpause the bridge
     * @param _proxiedTokensManager address of the proxied tokens manager
     * @param wrappedTokensAddresses array of wrapped tokens addresses to be included in the LBT
     * @param initNativeSupply initial native supply used to compute the native token amount when WETHToken is set
     */
    function initializeFromEtrog(
        address _bridgeManager,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager,
        address[] memory wrappedTokensAddresses,
        uint128 initNativeSupply
    ) public virtual getInitializedVersion reinitializer(3) {
        // Checks that upgrade is being done from the contract initialized
        if (_initializerVersion == 0) {
            revert InvalidInitializeFunction();
        }

        // Checks that the new parameters are not already set
        if (
            bridgeManager != address(0) ||
            emergencyBridgePauser != address(0) ||
            emergencyBridgeUnpauser != address(0) ||
            proxiedTokensManager != address(0)
        ) {
            revert ParameterAlreadyInitialized();
        }

        // Set bridge manager
        bridgeManager = _bridgeManager;

        // Set emergency bridge pauser and unpauser
        emergencyBridgePauser = _emergencyBridgePauser;
        emit AcceptEmergencyBridgePauserRole(address(0), emergencyBridgePauser);
        emergencyBridgeUnpauser = _emergencyBridgeUnpauser;
        emit AcceptEmergencyBridgeUnpauserRole(
            address(0),
            emergencyBridgeUnpauser
        );

        // Set proxied tokens manager
        require(
            _proxiedTokensManager != address(this),
            BridgeAddressNotAllowed()
        );

        // It's not allowed proxiedTokensManager to be zero address. If disabling token upgradability is required, add a not owned account like 0xffff...fffff
        require(_proxiedTokensManager != address(0), InvalidZeroAddress());
        proxiedTokensManager = _proxiedTokensManager;
        emit AcceptProxiedTokensManagerRole(address(0), proxiedTokensManager);

        _initializeLBT(wrappedTokensAddresses, initNativeSupply);
    }

    /**
     * @dev Initializes the Local Balance Tree (LBT) providing the wrapped tokens amounts
     * @param wrappedTokensAddresses array of wrapped tokens addresses
     * @param initNativeSupply initial native supply used to compute the native token amount when WETHToken is set
     * @notice If some tokens are not included (e.g are deployed just before the upgrade of this contract), they will be added later using the `setLocalBalanceTree` function.
     * This is treated as an edge case and in any case, the bridge will be functional but too much restrictive until correctly initialized.
     */
    function _initializeLBT(
        address[] memory wrappedTokensAddresses,
        uint256 initNativeSupply
    ) internal {
        // Set native token (ether or custom gas token)
        // Note: This will revert with arithmetic underflow if initNativeSupply < address(this).balance
        // This is intentional behavior to prevent incorrect initialization
        uint256 nativeGasTokenNetworkBalance = initNativeSupply -
            address(this).balance;

        _setLocalBalanceTree(
            gasTokenNetwork,
            gasTokenAddress,
            nativeGasTokenNetworkBalance
        );

        // If WETHToken exists, set WETH aswell
        if (address(WETHToken) != address(0)) {
            uint256 wethAmount = ITokenWrappedBridgeUpgradeable(
                address(WETHToken)
            ).totalSupply();

            _setLocalBalanceTree(
                0, // originNetwork is 0 for ether
                address(0), // originTokenAddress is 0 for ether
                wethAmount
            );
        }

        // Set all wrapped tokens
        for (uint256 i = 0; i < wrappedTokensAddresses.length; ++i) {
            address currentWrappedTokenAddress = wrappedTokensAddresses[i];
            TokenInformation memory tokenInfo = wrappedTokenToTokenInfo[
                currentWrappedTokenAddress
            ];

            // Check if the token exists
            if (tokenInfo.originTokenAddress == address(0)) {
                revert TokenNotMapped();
            }

            uint256 amount = ITokenWrappedBridgeUpgradeable(
                currentWrappedTokenAddress
            ).totalSupply();

            _setLocalBalanceTree(
                tokenInfo.originNetwork,
                tokenInfo.originTokenAddress,
                amount
            );
        }
    }
}
