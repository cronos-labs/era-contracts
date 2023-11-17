// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

/// @notice Library that contains an L2 transaction without calldata
/// @dev used to prevent deep stack error
library L2Transaction {
    using L2Transaction for Transaction;

    struct Transaction {
        address l2Contract; //L2 transaction msg.to
        uint256 l2Value; //L2 transaction msg.value
        uint256 l2GasLimit; //Maximum amount of L2 gas that transaction can consume during execution on L2
        uint256 l2GasPerPubdataByteLimit; //The maximum amount L2 gas that the operator may charge the user for single byte of pubdata
    }
}
