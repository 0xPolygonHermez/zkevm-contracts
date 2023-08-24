// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface ICDKDataCommitteeErrors {
    /**
     * @dev Thrown when the addres bytes doesn't have the expected length
     */
    error UnexpectedAddrsBytesLength();

    /**
     * @dev Thrown when the setup attempts to register a member with empty URL
     */
    error EmptyURLNotAllowed();

    /**
     * @dev Thrown when the setup register doesn't order the members correctly
     */
    error WrongAddrOrder();

    /**
     * @dev Thrown when the required amount of signatures is greater than the amount of members
     */
    error TooManyRequiredSignatures();

    /**
     * @dev Thrown when the hash of the committee doesn't match with the provided addresses
     */
    error UnexpectedCommitteeHash();

    /**
     * @dev Thrown when the signature of a DA hash doesn't belong to any member of the committee
     */
    error CommitteeAddressDoesntExist();

    /**
     * @dev Thrown when the addresses and signatures byte array length has an unexpected size
     */
    error UnexpectedAddrsAndSignaturesSize();
}