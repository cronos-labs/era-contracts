// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

/// @author Matter Labs
interface IL1BridgeLegacy {
    function deposit(
        address _l2Receiver,
        address _l1Token,
        uint256 _amount,
        uint256 _l2TxGasLimit,
        uint256 _l2TxGasPerPubdataByte
    ) external returns (bytes32 txHash);
}
