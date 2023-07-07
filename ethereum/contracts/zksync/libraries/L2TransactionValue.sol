// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

// extract this struct to prevent stack too deep error
struct L2TransactionValue {
    address l2Contract;
    uint256 l2Value;
    uint256 gasAmount;
    uint256 l2GasLimit;
    uint256 l2GasPerPubdataByteLimit;
}