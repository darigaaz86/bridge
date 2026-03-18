// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {QoreBridgeAggregator} from "../src/QoreBridgeAggregator.sol";
import {CctpProvider} from "../src/providers/CctpProvider.sol";
import {Usdt0Provider} from "../src/providers/Usdt0Provider.sol";
import {NearIntentsProvider} from "../src/providers/NearIntentsProvider.sol";

/// @title DeployDeterministic
/// @notice Deploys all contracts via CREATE2 so addresses are identical on every chain.
///
///         For the same address on every chain, these must be identical:
///         - DEPLOY_SALT (and derived provider salts)
///         - OWNER_ADDRESS, TREASURY_ADDRESS, FEE_BPS, MAX_FEE_BPS
///
///         Providers use no constructor args + initialize() pattern so their
///         CREATE2 bytecode hash is chain-independent.
contract DeployDeterministic is Script {
    bytes32 public constant CCTP_PROVIDER_ID = keccak256("cctp");
    bytes32 public constant USDT0_PROVIDER_ID = keccak256("usdt0");
    bytes32 public constant NEAR_INTENTS_PROVIDER_ID = keccak256("near-intents");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address ownerAddress = vm.envAddress("OWNER_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(5)));
        uint16 maxFeeBps = uint16(vm.envOr("MAX_FEE_BPS", uint256(100)));
        bytes32 salt = vm.envOr("DEPLOY_SALT", bytes32("qorebridge-v2"));

        // Chain-specific protocol addresses (zero = skip that provider)
        address tokenMessengerV2 = vm.envOr("TOKEN_MESSENGER_V2", address(0));
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        address oftContract = vm.envOr("OFT_CONTRACT", address(0));

        // Derive unique salts for each provider from the base salt
        bytes32 cctpSalt = keccak256(abi.encodePacked(salt, "cctp"));
        bytes32 usdt0Salt = keccak256(abi.encodePacked(salt, "usdt0"));
        bytes32 nearSalt = keccak256(abi.encodePacked(salt, "near-intents"));

        vm.startBroadcast(deployerPrivateKey);

        // ── 1. Deploy aggregator via CREATE2 ─────────────────────
        QoreBridgeAggregator aggregator = new QoreBridgeAggregator{salt: salt}(
            ownerAddress,
            treasuryAddress,
            feeBps,
            maxFeeBps
        );
        console.log("QoreBridgeAggregator:", address(aggregator));

        // ── 2. Deploy providers via CREATE2 (no constructor args) ─
        //    Then initialize with chain-specific addresses.

        if (tokenMessengerV2 != address(0) && usdcAddress != address(0)) {
            CctpProvider cctpProvider = new CctpProvider{salt: cctpSalt}();
            cctpProvider.initialize(tokenMessengerV2, usdcAddress);
            aggregator.registerProvider(CCTP_PROVIDER_ID, address(cctpProvider));
            console.log("CctpProvider:", address(cctpProvider));
        } else {
            console.log("CctpProvider skipped (TOKEN_MESSENGER_V2 or USDC_ADDRESS not set)");
        }

        if (oftContract != address(0)) {
            Usdt0Provider usdt0Provider = new Usdt0Provider{salt: usdt0Salt}();
            usdt0Provider.initialize(oftContract);
            aggregator.registerProvider(USDT0_PROVIDER_ID, address(usdt0Provider));
            console.log("Usdt0Provider:", address(usdt0Provider));
        } else {
            console.log("Usdt0Provider skipped (OFT_CONTRACT not set)");
        }

        NearIntentsProvider nearIntentsProvider = new NearIntentsProvider{salt: nearSalt}();
        aggregator.registerProvider(NEAR_INTENTS_PROVIDER_ID, address(nearIntentsProvider));
        console.log("NearIntentsProvider:", address(nearIntentsProvider));

        vm.stopBroadcast();

        // ── Summary ──────────────────────────────────────────────
        console.log("--- Deployment Summary ---");
        console.log("Chain ID:", block.chainid);
        console.log("Aggregator:", address(aggregator));
        console.log("Salt:", vm.toString(salt));
        console.log("Owner:", ownerAddress);
        console.log("Treasury:", treasuryAddress);
        console.log("Fee BPS:", feeBps);
        console.log("Max Fee BPS:", maxFeeBps);
    }
}
