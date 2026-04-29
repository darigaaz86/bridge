// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {QoreBridgeAggregator} from "../src/QoreBridgeAggregator.sol";
import {AcrossProvider} from "../src/providers/AcrossProvider.sol";

/// @title DeployAcrossProvider
/// @notice Deploys AcrossProvider via CREATE2 and registers it on the existing aggregator.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  - deployer wallet (must also be aggregator owner)
///   AGGREGATOR_ADDRESS    - existing QoreBridgeAggregator address
///   DEPLOY_SALT           - same base salt used for original deployment
contract DeployAcrossProvider is Script {
    bytes32 public constant ACROSS_PROVIDER_ID = keccak256("across");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address aggregatorAddress = vm.envAddress("AGGREGATOR_ADDRESS");
        bytes32 salt = vm.envOr("DEPLOY_SALT", bytes32("qorebridge-v2"));

        // Derive unique salt for Across provider
        bytes32 acrossSalt = keccak256(abi.encodePacked(salt, "across"));

        QoreBridgeAggregator aggregator = QoreBridgeAggregator(aggregatorAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy AcrossProvider via CREATE2 (no constructor args, no initialize needed)
        AcrossProvider acrossProvider = new AcrossProvider{salt: acrossSalt}();
        console.log("AcrossProvider:", address(acrossProvider));

        // Register on the aggregator
        aggregator.registerProvider(ACROSS_PROVIDER_ID, address(acrossProvider));
        console.log("Registered with providerId:", vm.toString(ACROSS_PROVIDER_ID));

        vm.stopBroadcast();

        // Summary
        console.log("--- Deployment Summary ---");
        console.log("Chain ID:", block.chainid);
        console.log("Aggregator:", aggregatorAddress);
        console.log("AcrossProvider:", address(acrossProvider));
        console.log("Provider ID (across):", vm.toString(ACROSS_PROVIDER_ID));
    }
}
