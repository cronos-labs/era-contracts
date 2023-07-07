// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "../Config.sol";
import "../facets/Mailbox.sol";
import "../libraries/Diamond.sol";
import "../../common/libraries/L2ContractHelper.sol";
import "../../common/L2ContractAddresses.sol";
import {L2TransactionValue} from "../libraries/L2TransactionValue.sol";


interface IOldContractDeployer {
    function forceDeployOnAddress(
        bytes32 _bytecodeHash,
        address _newAddress,
        bytes calldata _input
    ) external payable returns (address);
}

/// @author Matter Labs
contract DiamondUpgradeInit2 is MailboxFacet {
    function forceDeploy2(
        bytes calldata _upgradeDeployerCalldata,
        bytes calldata _upgradeSystemContractsCalldata,
        bytes[] calldata _factoryDeps
    ) external payable returns (bytes32) {
        // 1. Update bytecode for the deployer smart contract
        _requestL2Transaction(
            L2_FORCE_DEPLOYER_ADDR,
            0,
            L2TransactionValue(L2_DEPLOYER_SYSTEM_CONTRACT_ADDR, 0, 0, $(PRIORITY_TX_MAX_GAS_LIMIT), REQUIRED_L2_GAS_PRICE_PER_PUBDATA),
            _upgradeDeployerCalldata,
            _factoryDeps,
            true,
            address(0)
        );

        // 2. Redeploy other contracts by one transaction
        _requestL2Transaction(
            L2_FORCE_DEPLOYER_ADDR,
            0,
            L2TransactionValue(L2_DEPLOYER_SYSTEM_CONTRACT_ADDR, 0, 0,$(PRIORITY_TX_MAX_GAS_LIMIT), REQUIRED_L2_GAS_PRICE_PER_PUBDATA),
            _upgradeSystemContractsCalldata,
            _factoryDeps,
            true,
            address(0)
        );

        return Diamond.DIAMOND_INIT_SUCCESS_RETURN_VALUE;
    }
}
