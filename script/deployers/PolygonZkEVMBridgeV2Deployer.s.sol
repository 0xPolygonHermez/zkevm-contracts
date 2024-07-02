// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

////////////////////////////////////////////////////
// AUTOGENERATED - DO NOT EDIT THIS FILE DIRECTLY //
////////////////////////////////////////////////////

import "forge-std/Script.sol";

import "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import {TransparentUpgradeableProxy, ITransparentUpgradeableProxy} from "@openzeppelin/contracts5/proxy/transparent/TransparentUpgradeableProxy.sol";

abstract contract PolygonZkEVMBridgeV2Deployer is Script {
    IPolygonZkEVMBridgeV2Extended internal polygonZkEVMBridgeV2;
    ProxyAdmin internal polygonZkEVMBridgeV2ProxyAdmin;
    address internal polygonZkEVMBridgeV2Implementation;

    function deployPolygonZkEVMBridgeV2Transparent(
        address proxyAdminOwner,
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata
    )
        internal
        returns (address implementation, address proxyAdmin, address proxy)
    {
        bytes memory initData = abi.encodeWithSignature(
            "initialize(uint32,address,uint32,address,address,bytes)",
            _networkID,
            _gasTokenAddress,
            _gasTokenNetwork,
            _globalExitRootManager,
            _polygonRollupManager,
            _gasTokenMetadata
        );

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        polygonZkEVMBridgeV2Implementation = preDeployPolygonZkEVMBridgeV2();
        polygonZkEVMBridgeV2 = IPolygonZkEVMBridgeV2Extended(
            address(
                new TransparentUpgradeableProxy(
                    polygonZkEVMBridgeV2Implementation,
                    proxyAdminOwner,
                    initData
                )
            )
        );

        vm.stopBroadcast();

        polygonZkEVMBridgeV2ProxyAdmin = ProxyAdmin(
            address(
                uint160(
                    uint256(
                        vm.load(
                            address(polygonZkEVMBridgeV2),
                            hex"b53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
                        )
                    )
                )
            )
        );

        return (
            polygonZkEVMBridgeV2Implementation,
            address(polygonZkEVMBridgeV2ProxyAdmin),
            address(polygonZkEVMBridgeV2)
        );
    }

    function deployPolygonZkEVMBridgeV2Implementation()
        internal
        returns (address implementation)
    {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        implementation = preDeployPolygonZkEVMBridgeV2();
        vm.stopBroadcast();
    }

    function preDeployPolygonZkEVMBridgeV2()
        internal
        returns (address implementation)
    {
        string[] memory exe = new string[](6);
        exe[0] = "forge";
        exe[1] = "inspect";
        exe[2] = "PolygonZkEVMBridgeV2";
        exe[3] = "bytecode";
        exe[
            4
        ] = "--contracts=contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";
        exe[5] = "--optimize";

        bytes memory creationCode = vm.ffi(exe);
        implementation = makeAddr("PolygonZkEVMBridgeV2");

        vm.etch(implementation, creationCode);
        (bool success, bytes memory runtimeBytecode) = implementation.call("");
        require(success, "Failed to predeploy PolygonZkEVMBridgeV2");
        vm.etch(implementation, runtimeBytecode);
    }
}
