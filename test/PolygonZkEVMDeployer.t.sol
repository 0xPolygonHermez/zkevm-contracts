// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "test/util/TestHelpers.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/presets/ERC20PresetFixedSupplyUpgradeable.sol";

import "script/deployers/PolygonZkEVMDeployerDeployer.s.sol";

abstract contract Common is Test, TestHelpers {
    address internal polygonZkEVMDeployerOwner = makeAddr("owner");

    string internal tokenName = "Polygon";
    string internal tokenSymbol = "POL";
    bytes32 internal tokenSalt = bytes32(0);
    uint256 internal tokenSupply = 1000 ether;
    address internal tokenOwner = makeAddr("tokenOwner");
    address internal tokenDeterministicAddr;

    uint256 internal amount = 100 ether;

    address internal notOwner = makeAddr("notOwner");
    address internal receipient = makeAddr("receipient");

    bytes32 internal creationCodeHash;
    bytes internal creationCode;

    bytes transferCallData =
        abi.encodeWithSignature(
            "transfer(address,uint256)",
            receipient,
            amount
        );

    bytes transferCallDataFailure =
        abi.encodeWithSignature(
            "transfer(address,uint256)",
            address(0), // zero address
            amount
        );

    bytes initializeCallData =
        abi.encodeWithSignature(
            "initialize(string,string,uint256,address)",
            tokenName,
            tokenSymbol,
            tokenSupply,
            tokenOwner
        );

    event NewDeterministicDeployment(address newContractAddress);
    event FunctionCall();
    event FunctionalCall();

    constructor() {
        creationCode = abi.encodePacked(
            vm.getCode("ERC20PresetFixedSupplyUpgradeable"),
            ""
        );
        creationCodeHash = keccak256(abi.encodePacked(creationCode));
    }
}

abstract contract Predeployment is Common, PolygonZkEVMDeployerDeployer {
    function setUp() public virtual {
        polygonZkEVMDeployer = PolygonZkEVMDeployer(
            deployPolygonZkEVMDeployerImplementation(polygonZkEVMDeployerOwner)
        );
    }
}

contract PolygonZkEVMDeployerTestPredeployment is Predeployment {
    function test_owner() public view {
        assertEq(polygonZkEVMDeployer.owner(), polygonZkEVMDeployerOwner);
    }

    function test_predictDeterministicAddress() public view {
        address precalculatedTokenAddress = vm.computeCreate2Address(
            tokenSalt,
            creationCodeHash,
            address(polygonZkEVMDeployer)
        );

        address deterministicTokenAddress = polygonZkEVMDeployer
            .predictDeterministicAddress(tokenSalt, creationCodeHash);

        assertEq(precalculatedTokenAddress, deterministicTokenAddress);
    }

    function testRevert_deployDeterministic_notOwner() public {
        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(notOwner);
        polygonZkEVMDeployer.deployDeterministic(0, tokenSalt, creationCode);
    }

    function test_deployDeterministic() public {
        tokenDeterministicAddr = polygonZkEVMDeployer
            .predictDeterministicAddress(tokenSalt, creationCodeHash);

        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectEmit();
        emit NewDeterministicDeployment(tokenDeterministicAddr);
        polygonZkEVMDeployer.deployDeterministic(0, tokenSalt, creationCode);
    }

    function test_deployDeterministicAndCall() public {
        tokenDeterministicAddr = polygonZkEVMDeployer
            .predictDeterministicAddress(tokenSalt, creationCodeHash);

        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectEmit();
        emit NewDeterministicDeployment(tokenDeterministicAddr);
        polygonZkEVMDeployer.deployDeterministicAndCall(
            0,
            tokenSalt,
            creationCode,
            initializeCallData
        );
        ERC20PresetFixedSupplyUpgradeable token = ERC20PresetFixedSupplyUpgradeable(
                tokenDeterministicAddr
            );
        assertEq(token.name(), tokenName);
        assertEq(token.symbol(), tokenSymbol);
        assertEq(token.totalSupply(), tokenSupply);
    }
}

abstract contract Postdeployment is Common, PolygonZkEVMDeployerDeployer {
    function setUp() public virtual {
        polygonZkEVMDeployer = PolygonZkEVMDeployer(
            deployPolygonZkEVMDeployerImplementation(polygonZkEVMDeployerOwner)
        );

        tokenDeterministicAddr = polygonZkEVMDeployer
            .predictDeterministicAddress(tokenSalt, creationCodeHash);

        vm.startPrank(polygonZkEVMDeployerOwner);
        polygonZkEVMDeployer.deployDeterministic(0, tokenSalt, creationCode);

        polygonZkEVMDeployer.functionCall(
            tokenDeterministicAddr,
            initializeCallData,
            0
        );
        vm.stopPrank();
    }
}

contract PolygonZkEVMDeployerTestPostdeployment is Postdeployment {
    function testRevert_deployOnSameAddress() public {
        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectRevert("Create2: Failed on deploy");
        polygonZkEVMDeployer.deployDeterministic(0, tokenSalt, creationCode);
    }

    function testRevert_functionCall_callToNonContract() public {
        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectRevert("Address: call to non-contract");
        polygonZkEVMDeployer.functionCall(
            notOwner, // points to a non-contract address with no code
            transferCallData,
            0
        );
    }

    function testRevert_functionCall_lowLevelCallNotFound() public {
        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectRevert("Address: low-level call with value failed");
        polygonZkEVMDeployer.functionCall(
            address(this), // points to a contract address with no 'transfer' function
            transferCallData,
            0
        );
    }

    function testRevert_functionCall_lowLevelCallInternalRevert() public {
        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectRevert("ERC20: transfer to the zero address");
        polygonZkEVMDeployer.functionCall(
            tokenDeterministicAddr,
            transferCallDataFailure,
            0
        );
    }

    function testRevert_functionCall_notOwner() public {
        vm.expectRevert("Ownable: caller is not the owner");
        polygonZkEVMDeployer.functionCall(
            tokenDeterministicAddr,
            transferCallData,
            0
        );
    }

    function test_functionCall() public {
        // give some tokens to the polygonZkEVMDeployer contract since it will be the one calling the function
        vm.prank(tokenOwner); // msg.sender
        ERC20PresetFixedSupplyUpgradeable(tokenDeterministicAddr).transfer(
            address(polygonZkEVMDeployer),
            amount
        );

        // only the polygonZkEVMDeployerOwner can initiate the function call
        vm.prank(polygonZkEVMDeployerOwner);
        vm.expectEmit();
        emit FunctionCall();
        polygonZkEVMDeployer.functionCall(
            tokenDeterministicAddr,
            transferCallData,
            0
        );

        uint256 receipientBalance = ERC20PresetFixedSupplyUpgradeable(
            tokenDeterministicAddr
        ).balanceOf(receipient);
        assertEq(receipientBalance, amount);
    }
}
