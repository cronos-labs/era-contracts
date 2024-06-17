// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import {Diamond} from "../state-transition/libraries/Diamond.sol";
import {IVerifier} from "../state-transition/chain-interfaces/IVerifier.sol";
import {ZkSyncHyperchainBase} from "../state-transition/chain-deps/facets/ZkSyncHyperchainBase.sol";

/// @author Cronos-labs
/// @notice This upgrade will be used to upgrade cronos zkevm verifier
contract UpgradeVerifier is ZkSyncHyperchainBase {
    /// @notice The main function that will be called by the upgrade proxy.
    function upgrade(address _verifier) public returns (bytes32) {
        s.verifier = IVerifier(_verifier);

        return Diamond.DIAMOND_INIT_SUCCESS_RETURN_VALUE;
    }
}