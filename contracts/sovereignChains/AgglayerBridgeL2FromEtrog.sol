pragma solidity 0.8.28;

import "./AgglayerBridgeL2.sol";

// Contract created to perform the upgrade from the Etrog version to the AgglayerBridgeL2 version.
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
     * @param originNetworkArray The origin network of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @param originTokenAddressArray The origin address of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @param amountArray The amount to set for the local balance tree leaf
     */
    function initializeFromEtrog(
        address _bridgeManager,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager,
        uint32[] memory originNetworkArray,
        address[] memory originTokenAddressArray,
        uint256[] memory amountArray
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

        // set local balance tree
        _setLocalBalanceTree(
            originNetworkArray,
            originTokenAddressArray,
            amountArray
        );
    }
}
