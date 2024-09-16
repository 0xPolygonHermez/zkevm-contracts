// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "test/util/TestHelpers.sol";

import {IPolygonDataCommitteeErrors} from "contracts/interfaces/IPolygonDataCommitteeErrors.sol";
import "script/deployers/PolygonDataCommitteeDeployer.s.sol";

contract PolygonDataCommitteeTest is
    Test,
    TestHelpers,
    PolygonDataCommitteeDeployer
{
    struct CommitteeMember {
        address addr;
        uint256 privateKey;
    }

    address proxyAdminOwner = makeAddr("proxyAdminOwner");
    address dataCommitteeOwner;

    event CommitteeUpdated(bytes32 committeeHash);

    function setUp() public {
        deployPolygonDataCommitteeTransparent(proxyAdminOwner);
        dataCommitteeOwner = polygonDataCommittee.owner();
    }

    function testRevert_initialize_alreadyInitialized() public {
        vm.expectRevert("Initializable: contract is already initialized");
        polygonDataCommittee.initialize();
    }

    function test_initialize() public view {
        assertEq(
            polygonDataCommittee.getProcotolName(),
            "DataAvailabilityCommittee"
        );
    }

    function testRevert_setupCommittee_tooManyRequiredSignatures() public {
        uint256 requiredAmountOfSignatures = 3;
        (
            ,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(
                2 // different from requiredAmountOfSignatures
            );

        vm.expectRevert(
            IPolygonDataCommitteeErrors.TooManyRequiredSignatures.selector
        );
        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );
    }

    function testRevert_setupCommittee_UnexpectedAddrsBytesLength() public {
        uint256 requiredAmountOfSignatures = 2;
        (, , string[] memory committeeMemberUrls) = _generateCommitteeMembers(
            requiredAmountOfSignatures
        );

        vm.expectRevert(
            IPolygonDataCommitteeErrors.UnexpectedAddrsBytesLength.selector
        );
        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            bytes("") // empty bytes
        );
    }

    function testRevert_setupCommittee_EmptyURLNotAllowed() public {
        uint256 requiredAmountOfSignatures = 2;
        string[] memory committeeMemberUrls = new string[](2);
        committeeMemberUrls[0] = "http://committeeMember0.com";
        committeeMemberUrls[1] = ""; // empty URL
        (, bytes memory committeeMemberAddrBytes, ) = _generateCommitteeMembers(
            requiredAmountOfSignatures
        );

        vm.expectRevert(
            IPolygonDataCommitteeErrors.EmptyURLNotAllowed.selector
        );
        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );
    }

    function testRevert_setupCommittee_WrongAddrOrder() public {
        uint256 requiredAmountOfSignatures = 2;
        (, , string[] memory committeeMemberUrls) = _generateCommitteeMembers(
            requiredAmountOfSignatures
        );
        bytes memory committeeMemberAddrBytes = abi.encodePacked(
            makeAddr("committeeMember0"),
            makeAddr("committeeMember1") // wrong order
        );

        vm.expectRevert(IPolygonDataCommitteeErrors.WrongAddrOrder.selector);
        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );
    }

    function test_setupCommittee() public {
        uint256 requiredAmountOfSignatures = 2;
        (
            ,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(requiredAmountOfSignatures);

        vm.expectEmit();
        emit CommitteeUpdated(keccak256(committeeMemberAddrBytes));
        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );

        assertEq(polygonDataCommittee.requiredAmountOfSignatures(), 2);
        assertEq(
            polygonDataCommittee.committeeHash(),
            keccak256(committeeMemberAddrBytes)
        );
    }

    function testRevert_verifyMessage_unexpectedAddrsAndSignaturesSize()
        public
    {
        uint256 requiredAmountOfSignatures = 2;
        (
            ,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(requiredAmountOfSignatures);

        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );

        bytes32 inputHash = keccak256("inputHash");
        bytes memory aggrSig = new bytes(65); // only 1 signature
        bytes memory signaturesAndAddrs = abi.encodePacked(
            aggrSig,
            committeeMemberAddrBytes
        );

        vm.expectRevert(
            IPolygonDataCommitteeErrors
                .UnexpectedAddrsAndSignaturesSize
                .selector
        );
        polygonDataCommittee.verifyMessage(inputHash, signaturesAndAddrs);
    }

    function testRevert_verifyMessage_unexpectedCommitteeHash() public {
        uint256 requiredAmountOfSignatures = 2;
        (
            CommitteeMember[] memory committeeMembers,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(requiredAmountOfSignatures);

        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );

        bytes32 inputHash = keccak256("inputHash");
        bytes memory aggrSig = _signAndGetAggregatedSig(
            committeeMembers,
            inputHash
        );
        bytes memory signaturesAndAddrs = abi.encodePacked(
            aggrSig,
            makeAddr("committeeMember1") // just one address
        );

        vm.expectRevert(
            IPolygonDataCommitteeErrors.UnexpectedCommitteeHash.selector
        );
        polygonDataCommittee.verifyMessage(inputHash, signaturesAndAddrs);
    }

    function testRevert_verifyMessage_committeeAddressDoesNotExist() public {
        uint256 requiredAmountOfSignatures = 2;
        (
            CommitteeMember[] memory committeeMembers,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(requiredAmountOfSignatures);

        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );

        bytes32 inputHash = keccak256("inputHash");
        bytes memory aggrSig = _signAndGetAggregatedSig(
            committeeMembers,
            inputHash
        );
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(
            committeeMembers[0].privateKey,
            inputHash
        );
        bytes memory signature1 = abi.encodePacked(r1, s1, v1);
        (uint8 v3, bytes32 r3, bytes32 s3) = vm.sign(
            makeAccount("committeeMember3").key,
            inputHash
        );
        bytes memory signature3 = abi.encodePacked(r3, s3, v3); // signature of a non-existing committee member
        aggrSig = abi.encodePacked(signature1, signature3);
        bytes memory signaturesAndAddrs = abi.encodePacked(
            aggrSig,
            committeeMemberAddrBytes
        );

        vm.expectRevert(
            IPolygonDataCommitteeErrors.CommitteeAddressDoesNotExist.selector
        );
        polygonDataCommittee.verifyMessage(inputHash, signaturesAndAddrs);
    }

    function test_verifyMessage() public {
        uint256 requiredAmountOfSignatures = 2;
        (
            CommitteeMember[] memory committeeMembers,
            bytes memory committeeMemberAddrBytes,
            string[] memory committeeMemberUrls
        ) = _generateCommitteeMembers(requiredAmountOfSignatures);

        vm.prank(dataCommitteeOwner);
        polygonDataCommittee.setupCommittee(
            requiredAmountOfSignatures,
            committeeMemberUrls,
            committeeMemberAddrBytes
        );
        assertEq(polygonDataCommittee.getAmountOfMembers(), 2);

        bytes32 inputHash = keccak256("inputHash");
        bytes memory aggrSig = _signAndGetAggregatedSig(
            committeeMembers,
            inputHash
        );
        bytes memory signaturesAndAddrs = abi.encodePacked(
            aggrSig,
            committeeMemberAddrBytes
        );

        polygonDataCommittee.verifyMessage(inputHash, signaturesAndAddrs);
    }

    function _generateCommitteeMembers(
        uint256 numOfMembers
    )
        internal
        returns (CommitteeMember[] memory, bytes memory, string[] memory)
    {
        CommitteeMember[] memory committeeMembers = new CommitteeMember[](
            numOfMembers
        );
        bytes memory committeeMemberAddrBytes = new bytes(0);
        string[] memory committeeMemberUrls = new string[](
            committeeMembers.length
        );
        for (uint256 i = 0; i < numOfMembers; i++) {
            Account memory memberAccount = makeAccount(
                string.concat("committeeMember", Strings.toString(i))
            );
            committeeMembers[i] = CommitteeMember(
                memberAccount.addr,
                memberAccount.key
            );
        }

        committeeMembers = _sortMembersByIncrementingAddresses(
            committeeMembers
        );

        for (uint256 i = 0; i < committeeMembers.length; i++) {
            committeeMemberAddrBytes = abi.encodePacked(
                committeeMemberAddrBytes,
                committeeMembers[i].addr
            );
            committeeMemberUrls[i] = string.concat(
                "http://committeeMember",
                Strings.toString(i),
                ".com"
            );
        }

        return (
            committeeMembers,
            committeeMemberAddrBytes,
            committeeMemberUrls
        );
    }

    function _sortMembersByIncrementingAddresses(
        CommitteeMember[] memory committeeMembers
    ) internal pure returns (CommitteeMember[] memory) {
        uint256 n = committeeMembers.length;
        bool swapped;

        do {
            swapped = false;
            for (uint256 i = 0; i < n - 1; i++) {
                if (committeeMembers[i].addr > committeeMembers[i + 1].addr) {
                    CommitteeMember memory temp = committeeMembers[i];
                    committeeMembers[i] = committeeMembers[i + 1];
                    committeeMembers[i + 1] = temp;

                    swapped = true;
                }
            }
            n--;
        } while (swapped);

        return committeeMembers;
    }

    function _signAndGetAggregatedSig(
        CommitteeMember[] memory committeeMembers,
        bytes32 inputHash
    ) internal pure returns (bytes memory) {
        bytes memory aggrSig = bytes("");
        for (uint256 i = 0; i < committeeMembers.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(
                committeeMembers[i].privateKey,
                inputHash
            );
            bytes memory signature = abi.encodePacked(r, s, v);
            aggrSig = abi.encodePacked(aggrSig, signature);
        }
        return aggrSig;
    }
}
