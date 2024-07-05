// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {ZkEVMCommon} from "test/util/ZkEVMCommon.sol";

import "contracts/interfaces/IPolygonZkEVMBridgeV2Extended.sol";
import "contracts/lib/TokenWrapped.sol";
import "contracts/mocks/ERC20PermitMock.sol";
import "contracts/PolygonZkEVMGlobalExitRootV2.sol";

import "script/deployers/PolygonZkEVMBridgeV2Deployer.s.sol";
import "script/deployers/PolygonZkEVMGlobalExitRootV2Deployer.s.sol";

contract PolygonZkEVMBridgeV2Test is
    Test,
    ZkEVMCommon,
    PolygonZkEVMBridgeV2Deployer,
    PolygonZkEVMGlobalExitRootV2Deployer
{
    IPolygonZkEVMBridgeV2Extended polygonZkEVMBridge;
    ERC20PermitMock pol;

    address deployer = makeAddr("deployer");
    address rollupManager = makeAddr("rollupManager");
    address user = makeAddr("user");
    address polygonZkEVMGlobalExitRootV2ProxyOwner =
        makeAddr("polygonZkEVMGlobalExitRootV2ProxyOwner");
    address polOwner = makeAddr("polOwner");
    address destinationAddress = makeAddr("destinationAddress");
    address wethCalculated;

    string constant tokenName = "Polygon";
    string constant tokenSymbol = "POL";
    uint256 constant tokenInitialBalance = 20000000 ether;
    uint256 constant tokenTransferAmount = 10 ether;

    string constant WETH_NAME = "Wrapped Ether";
    string constant WETH_SYMBOL = "WETH";

    uint32 constant networkIDMainnet = 0;
    uint32 constant networkIDRollup = 1;
    uint8 constant tokenDecimals = 18;
    uint8 constant WETH_DECIMALS = 18;
    uint8 constant LEAF_TYPE_ASSET = 0;
    uint8 constant LEAF_TYPE_MESSAGE = 1;

    bytes tokenMetaData = abi.encode(tokenName, tokenSymbol, tokenDecimals);
    bytes wethMetaData = abi.encode(WETH_NAME, WETH_SYMBOL, WETH_DECIMALS);

    event BridgeEvent(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes metadata,
        uint32 depositCount
    );

    function setUp() public virtual {
        IPolygonZkEVMBridgeV2Extended polygonZkEVMBridgeImplementation = IPolygonZkEVMBridgeV2Extended(
                _preDeployPolygonZkEVMBridgeV2()
            );

        polygonZkEVMBridge = IPolygonZkEVMBridgeV2Extended(
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

        pol = new ERC20PermitMock(
            tokenName,
            tokenSymbol,
            polOwner,
            tokenInitialBalance
        );

        bytes memory bytecode = polygonZkEVMBridge
            .BASE_INIT_BYTECODE_WRAPPED_TOKEN();
        bytes memory creationCode = abi.encodePacked(
            bytecode,
            abi.encode(WETH_NAME, WETH_SYMBOL, WETH_DECIMALS)
        );
        wethCalculated = vm.computeCreate2Address(
            0, // salt
            keccak256(creationCode),
            address(polygonZkEVMBridge)
        );
    }

    function test_initialize_gasTokenNotPresent() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(0));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function test_initialize_gasTokenPresent() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );
        assertEq(polygonZkEVMBridge.networkID(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.WETHToken(), wethCalculated);
        assertEq(polygonZkEVMBridge.gasTokenAddress(), address(pol));
        assertEq(polygonZkEVMBridge.gasTokenNetwork(), networkIDMainnet);
        assertEq(polygonZkEVMBridge.gasTokenMetadata(), tokenMetaData);

        assertEq(
            address(polygonZkEVMBridge.globalExitRootManager()),
            address(polygonZkEVMGlobalExitRootV2)
        );
        assertEq(polygonZkEVMBridge.polygonRollupManager(), rollupManager);
    }

    function testRevert_initialize_gasTokenNetworkMustBeZeroOnEther() public {
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended
                .GasTokenNetworkMustBeZeroOnEther
                .selector
        );
        _initializePolygonZkEVMBridge(address(0), networkIDRollup, bytes(""));
    }

    function testRevert_initialize_reinitialize() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert("Initializable: contract is already initialized");
        polygonZkEVMBridge.initialize(
            networkIDMainnet,
            address(0),
            networkIDMainnet,
            polygonZkEVMGlobalExitRootV2,
            rollupManager,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDMainnet, // same network as bridge
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_amountDoesNotMatchMsgValue() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        // sending native asset
        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.AmountDoesNotMatchMsgValue.selector
        );
        polygonZkEVMBridge.bridgeAsset( // msg.value = 0 && msg.value != tokenTransferAmount
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(0),
            true,
            bytes("")
        );
    }

    function testRevert_bridgeAsset_msgValueNotZero() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));
        vm.expectRevert(IPolygonZkEVMBridgeV2Extended.MsgValueNotZero.selector);
        polygonZkEVMBridge.bridgeAsset{value: tokenTransferAmount}(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
    }

    function test_bridgeAsset_assetIsTheGasToken() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(address(polygonZkEVMBridge));
        TokenWrapped(wethCalculated).mint(user, tokenTransferAmount);
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(user),
            tokenTransferAmount
        );

        vm.prank(user);
        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(0),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            bytes(""),
            0
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            wethCalculated,
            true,
            bytes("")
        );
        assertEq(TokenWrapped(wethCalculated).balanceOf(user), 0);
        assertEq(polygonZkEVMBridge.lastUpdatedDepositCount(), 1);
    }

    function test_bridgeAsset_assetIsTokenOnTheBridgeNetwork() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(polOwner);
        pol.mint(user, tokenTransferAmount);
        assertEq(pol.balanceOf(user), tokenTransferAmount);

        vm.startPrank(user);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);

        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            tokenMetaData,
            0
        );
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
        vm.stopPrank();
        assertEq(
            pol.balanceOf(address(polygonZkEVMBridge)),
            tokenTransferAmount
        );
        assertEq(pol.balanceOf(user), 0);
        assertEq(polygonZkEVMBridge.lastUpdatedDepositCount(), 1);
    }

    function test_bridgeAsset_verifyProof() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_ASSET,
            networkIDMainnet,
            address(pol),
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            keccak256(abi.encodePacked(tokenMetaData))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        vm.prank(polOwner);
        pol.mint(user, tokenTransferAmount);

        vm.startPrank(user);
        pol.approve(address(polygonZkEVMBridge), tokenTransferAmount);
        polygonZkEVMBridge.bridgeAsset(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            address(pol),
            true,
            bytes("")
        );
        vm.stopPrank();

        bytes32 calculatedMainnetRoot = _getMerkleTreeRoot(encodedLeaves);
        assertEq(polygonZkEVMBridge.getRoot(), calculatedMainnetRoot);

        bytes32[32] memory proof = _getProofByIndex(encodedLeaves, "0");
        assertEq(
            polygonZkEVMBridge.verifyMerkleProof(
                leaf,
                proof,
                0,
                polygonZkEVMBridge.getRoot()
            ),
            true
        );
    }

    function testRevert_bridgeMessage_noValueInMessagesOnGasTokenNetworks()
        public
    {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended
                .NoValueInMessagesOnGasTokenNetworks
                .selector
        );
        polygonZkEVMBridge.bridgeMessage{value: tokenTransferAmount}(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );
    }

    function testRevert_bridgeMessage_destinationNetworkInvalid() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.DestinationNetworkInvalid.selector
        );
        polygonZkEVMBridge.bridgeMessage(
            networkIDMainnet, // same network as bridge
            destinationAddress,
            true,
            bytes("")
        );
    }

    function test_bridgeMessage() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDRollup,
            destinationAddress,
            0,
            bytes(""),
            0
        );
        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );
    }

    function test_bridgeMessage_verifyProof() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        bytes32 leaf = polygonZkEVMBridge.getLeafValue(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            address(this),
            networkIDRollup,
            destinationAddress,
            0,
            keccak256(abi.encodePacked(bytes("")))
        );

        bytes32[] memory leaves = new bytes32[](1);
        leaves[0] = leaf;
        string memory encodedLeaves = _encodeLeaves(leaves);

        polygonZkEVMBridge.bridgeMessage(
            networkIDRollup,
            destinationAddress,
            true,
            bytes("")
        );

        bytes32 calculatedMainnetRoot = _getMerkleTreeRoot(encodedLeaves);
        assertEq(polygonZkEVMBridge.getRoot(), calculatedMainnetRoot);

        bytes32[32] memory proof = _getProofByIndex(encodedLeaves, "0");
        assertEq(
            polygonZkEVMBridge.verifyMerkleProof(
                leaf,
                proof,
                0,
                polygonZkEVMBridge.getRoot()
            ),
            true
        );
    }

    function testRevert_bridgeMessageWETH_nativeTokenIsEther() public {
        _initializePolygonZkEVMBridge(address(0), networkIDMainnet, bytes(""));

        vm.expectRevert(
            IPolygonZkEVMBridgeV2Extended.NativeTokenIsEther.selector
        );
        polygonZkEVMBridge.bridgeMessageWETH(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            true,
            wethMetaData
        );
    }

    function test_bridgeMessageWETH() public {
        _initializePolygonZkEVMBridge(
            address(pol),
            networkIDMainnet,
            tokenMetaData
        );

        vm.prank(address(polygonZkEVMBridge));
        TokenWrapped(wethCalculated).mint(user, tokenTransferAmount);
        assertEq(
            TokenWrapped(wethCalculated).balanceOf(user),
            tokenTransferAmount
        );

        vm.prank(user);
        vm.expectEmit();
        emit BridgeEvent(
            LEAF_TYPE_MESSAGE,
            networkIDMainnet,
            user,
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            wethMetaData,
            0
        );
        polygonZkEVMBridge.bridgeMessageWETH(
            networkIDRollup,
            destinationAddress,
            tokenTransferAmount,
            true,
            wethMetaData
        );
        assertEq(TokenWrapped(wethCalculated).balanceOf(user), 0);
    }

    //TODO: add more tests

    function _initializePolygonZkEVMBridge(
        address gasTokenAddress,
        uint32 gasTokenNetwork,
        bytes memory gasTokenMetadata
    ) internal {
        polygonZkEVMBridge.initialize(
            networkIDMainnet, //_networkID
            gasTokenAddress, //_gasTokenAddress
            gasTokenNetwork, //_gasTokenNetwork
            polygonZkEVMGlobalExitRootV2, //_globalExitRootManager
            rollupManager, //_polygonRollupManager
            gasTokenMetadata //_gasTokenMetadata
        );
    }

    function _proxify(address logic) internal returns (address proxy) {
        TransparentUpgradeableProxy proxy_ = new TransparentUpgradeableProxy(
            logic,
            msg.sender,
            ""
        );
        return (address(proxy_));
    }

    function _preDeployPolygonZkEVMBridgeV2()
        internal
        returns (address implementation)
    {
        string[] memory exe = new string[](5);
        exe[0] = "forge";
        exe[1] = "inspect";
        exe[2] = "PolygonZkEVMBridgeV2";
        exe[3] = "bytecode";
        exe[
            4
        ] = "--contracts=contracts-ignored-originals/PolygonZkEVMBridgeV2.sol";

        bytes memory creationCode = vm.ffi(exe);
        implementation = makeAddr("PolygonZkEVMBridgeV2");

        vm.etch(implementation, creationCode);
        (bool success, bytes memory runtimeBytecode) = implementation.call("");
        require(success, "Failed to predeploy PolygonZkEVMBridgeV2");
        vm.etch(implementation, runtimeBytecode);
    }
}
