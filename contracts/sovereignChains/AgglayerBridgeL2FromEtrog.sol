pragma solidity 0.8.28;

import "./AgglayerBridgeL2.sol";

contract AgglayerBridgeL2FromEtrog is AgglayerBridgeL2 {
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

    function initializeBridgeZkEVM(
        address _bridgeManager,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) public virtual reinitializer(3) {
        bridgeManager = _bridgeManager;
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
    }

}