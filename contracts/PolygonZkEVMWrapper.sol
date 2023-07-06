// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "./inheritedMainContracts/PolygonZkEVM.sol";

contract PolygonZkEVMWrapper is PolygonZkEVM{
    function initialize(
        InitializePackedParameters calldata initializePackedParameters,
        bytes32 genesisRoot,
        string memory _trustedSequencerURL,
        string memory _networkName,
        string calldata _version,
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        IPolygonZkEVMBridge _bridgeAddress,
        uint64 _chainID,
        uint64 _forkID
    ) public override initializer {
        PolygonZkEVM.initialize(
            initializePackedParameters,
            genesisRoot,
            _trustedSequencerURL,
            _networkName,
            _version,
            _globalExitRootManager,
            _matic,
            _rollupVerifier,
            _bridgeAddress,
            _chainID,
            _forkID
        );
    }
}