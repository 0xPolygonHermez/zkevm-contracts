// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "script/deployers/PolygonZkEVMEtrogDeployer.s.sol";

contract Deploy is Script, PolygonZkEVMEtrogDeployer {
    function run() public {
        // address proxyAdminOwner = makeAddr("proxyAdminOwner");

        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager = IPolygonZkEVMGlobalExitRootV2(
                makeAddr("PolygonZkEVMGlobalExitRootV2")
            );
        IERC20Upgradeable _pol = IERC20Upgradeable(makeAddr("POL"));
        IPolygonZkEVMBridgeV2 _bridgeAddress = IPolygonZkEVMBridgeV2(
            makeAddr("PolygonZkEVMBridgeV2")
        );
        PolygonRollupManager _rollupManager = PolygonRollupManager(
            makeAddr("RollupManager")
        );
        // address _admin = makeAddr("admin");
        // address _sequencer = makeAddr("sequencer");
        // address _gasTokenAddress = makeAddr("gasTokenAddress");
        // string memory _sequencerURL = "https://sequencer.mainnet.io";
        // string memory _networkName = "Mainnet";
        // uint32 _networkID = 0;

        // TODO: find out why the transparent deployer is not working
        // deployPolygonZkEVMEtrogTransparent(
        //     proxyAdminOwner,
        //     _globalExitRootManager,
        //     _pol,
        //     _bridgeAddress,
        //     _rollupManager,
        //     _admin,
        //     _sequencer,
        //     _networkID,
        //     _gasTokenAddress,
        //     _sequencerURL,
        //     _networkName
        // );

        deployPolygonZkEVMEtrogImplementation(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        );
    }
}
