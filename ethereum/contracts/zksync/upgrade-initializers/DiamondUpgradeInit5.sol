// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../Config.sol";
import "../facets/Mailbox.sol";
import "../libraries/Diamond.sol";
import "../../common/libraries/L2ContractHelper.sol";
import "../../common/L2ContractAddresses.sol";
import {L2Transaction} from "../libraries/L2Transaction.sol";

/// @author Matter Labs
contract DiamondUpgradeInit5 is MailboxFacet {
    function forceDeploy(
        bytes calldata _upgradeDeployerCalldata,
        bytes calldata _upgradeSystemContractsCalldata,
        bytes[] calldata _factoryDeps
    ) external payable returns (bytes32) {
        // 1. Update bytecode for the deployer smart contract
        _requestL2Transaction(
            L2_FORCE_DEPLOYER_ADDR,
            L2Transaction.Transaction(L2_DEPLOYER_SYSTEM_CONTRACT_ADDR, 0, $(PRIORITY_TX_MAX_GAS_LIMIT), REQUIRED_L2_GAS_PRICE_PER_PUBDATA),
            _upgradeDeployerCalldata,
            _factoryDeps,
            true,
            address(0),
            0
        );

        // 2. Redeploy system contracts by one priority transaction
        _requestL2Transaction(
            L2_FORCE_DEPLOYER_ADDR,
            L2Transaction.Transaction(L2_DEPLOYER_SYSTEM_CONTRACT_ADDR, 0, $(PRIORITY_TX_MAX_GAS_LIMIT), REQUIRED_L2_GAS_PRICE_PER_PUBDATA),
            _upgradeSystemContractsCalldata,
            _factoryDeps,
            true,
            address(0),
            0
        );

        return Diamond.DIAMOND_INIT_SUCCESS_RETURN_VALUE;
    }
}
