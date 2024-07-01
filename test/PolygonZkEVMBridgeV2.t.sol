// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

import "contracts/mocks/ERC20PermitMock.sol";
import "contracts/PolygonZkEVMGlobalExitRootV2.sol";
import "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";

import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMBridgeV2Test is
    Test,
    PolygonZkEVMBridgeV2Deployer,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    PolygonZkEVMBridgeV2 polygonZkEVMBridge;
    ERC20PermitMock pol;

    address deployer = makeAddr("deployer");
    address rollupManager = makeAddr("rollupManager");
    address user = makeAddr("user");
    address polygonZkEVMGlobalExitRootV2ProxyOwner =
        makeAddr("polygonZkEVMGlobalExitRootV2ProxyOwner");
    address polOwner = makeAddr("polOwner");
    address destinationAddress = makeAddr("destinationAddress");

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20000000 ether;
    uint256 constant tokenTransferAmount = 10 ether;

    uint256 constant LEAF_TYPE_ASSET = 0;
    uint256 constant LEAF_TYPE_MESSAGE = 1;

    uint32 constant networkIDMainnet = 0;
    uint32 constant networkIDRollup = 1;
    uint8 constant tokenDecimals = 18;
    bytes tokenMetaData = abi.encode(tokenName, tokenSymbol, tokenDecimals);

    // mapping(string functionName => mapping(string snapshotName => uint256 snapshotId))
    //     private snapshot;

    function setUp() public virtual {
        PolygonZkEVMBridgeV2 polygonZkEVMBridgeImplementation = PolygonZkEVMBridgeV2(
                deployPolygonZkEVMBridgeV2Implementation()
            );

        polygonZkEVMBridge = PolygonZkEVMBridgeV2(
            _proxify(address(polygonZkEVMBridgeImplementation))
        );

        address polygonZkEVMGlobalExitRootV2Proxy;
        (
            ,
            ,
            polygonZkEVMGlobalExitRootV2Proxy
        ) = deployPolygonZkEVMGlobalExitRootV2Transparent(
            polygonZkEVMGlobalExitRootV2ProxyOwner,
            rollupManager,
            address(polygonZkEVMBridge)
        );

        polygonZkEVMGlobalExitRootV2 = PolygonZkEVMGlobalExitRootV2(
            polygonZkEVMGlobalExitRootV2Proxy
        );

        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            "0x"
        );

        pol = new ERC20PermitMock(
            tokenName,
            tokenSymbol,
            polOwner,
            tokenInitialBalance
        );

        vm.prank(polOwner);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);
    }

    function test_initialization() public view {
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(0));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function testRevert_reinitialize() public {
        vm.expectRevert("Initializable: contract is already initialized");
        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            "0x"
        );
    }

    function testRevert_bridgeAsset_destinationNetworkInvalid() public {
        vm.expectRevert(
            IPolygonZkEVMBridgeV2.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDMainnet,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            "0x"
        );
    }

    function testRevert_bridgeAsset_amountDoesNotMatchMsgValue() public {
        // sending native asset
        vm.expectRevert(
            IPolygonZkEVMBridgeV2.AmountDoesNotMatchMsgValue.selector
        );
        polygonZkEVMBridge.bridgeAsset( // msg.value = 0
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(0),
            true,
            "0x"
        );
    }

    function testRevert_bridgeAsset_msgValueNotZero() public {
        vm.expectRevert(IPolygonZkEVMBridgeV2.MsgValueNotZero.selector);
        polygonZkEVMBridge.bridgeAsset{value: 1 ether}(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            "0x"
        );
    }

    //TODO: add more tests

    function _proxify(address logic) internal returns (address proxy) {
        TransparentUpgradeableProxy proxy_ = new TransparentUpgradeableProxy(
            logic,
            msg.sender,
            ""
        );
        return (address(proxy_));
    }
}
