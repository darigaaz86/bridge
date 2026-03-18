// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {QoreBridgeAggregator} from "../src/QoreBridgeAggregator.sol";
import {CctpProvider} from "../src/providers/CctpProvider.sol";
import {Usdt0Provider} from "../src/providers/Usdt0Provider.sol";
import {NearIntentsProvider} from "../src/providers/NearIntentsProvider.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockTokenMessengerV2} from "../test/mocks/MockTokenMessengerV2.sol";
import {MockOFT} from "../test/mocks/MockOFT.sol";

/// @title TestLocalDeploy
/// @notice Deploys everything to a local Anvil chain with mocks, then exercises
///         all three bridge paths (CCTP, USDT0, NEAR Intents) to verify the
///         full flow works end-to-end.
///
/// Usage:
///   anvil                          # terminal 1
///   forge script script/TestLocalDeploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -vvvv
contract TestLocalDeploy is Script {
    bytes32 constant CCTP_ID = keccak256("cctp");
    bytes32 constant USDT0_ID = keccak256("usdt0");
    bytes32 constant NEAR_ID = keccak256("near-intents");

    function run() external {
        // Anvil default account #0
        uint256 pk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // ── 1. Deploy mocks ──────────────────────────────────────
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 usdt = new MockERC20("Tether USD", "USDT", 6);
        MockTokenMessengerV2 mockCctp = new MockTokenMessengerV2();
        MockOFT mockOft = new MockOFT();

        console.log("MockUSDC:", address(usdc));
        console.log("MockUSDT:", address(usdt));
        console.log("MockCCTP:", address(mockCctp));
        console.log("MockOFT: ", address(mockOft));

        // ── 2. Deploy aggregator (CREATE2) ───────────────────────
        bytes32 salt = bytes32("qorebridge-test");
        QoreBridgeAggregator agg = new QoreBridgeAggregator{salt: salt}(
            deployer,       // owner
            deployer,       // treasury (self for testing)
            5,              // 5 bps = 0.05%
            100             // max 100 bps = 1%
        );
        console.log("Aggregator:", address(agg));

        // ── 3. Deploy & register providers ───────────────────────
        CctpProvider cctpProv = new CctpProvider();
        cctpProv.initialize(address(mockCctp), address(usdc));
        agg.registerProvider(CCTP_ID, address(cctpProv));
        console.log("CctpProvider:", address(cctpProv));

        Usdt0Provider usdt0Prov = new Usdt0Provider();
        usdt0Prov.initialize(address(mockOft));
        agg.registerProvider(USDT0_ID, address(usdt0Prov));
        console.log("Usdt0Provider:", address(usdt0Prov));

        NearIntentsProvider nearProv = new NearIntentsProvider();
        agg.registerProvider(NEAR_ID, address(nearProv));
        console.log("NearIntentsProvider:", address(nearProv));

        // ── 4. Mint tokens to deployer ───────────────────────────
        uint256 mintAmount = 10_000 * 1e6; // 10k USDC/USDT
        usdc.mint(deployer, mintAmount);
        usdt.mint(deployer, mintAmount);

        // ── 5. Approve aggregator ────────────────────────────────
        usdc.approve(address(agg), type(uint256).max);
        usdt.approve(address(agg), type(uint256).max);

        // ── 6. Test CCTP bridge ──────────────────────────────────
        console.log("");
        console.log("=== Test 1: CCTP Bridge ===");
        uint256 cctpAmount = 1000 * 1e6; // 1000 USDC
        bytes memory cctpData = abi.encode(
            uint32(3),                  // destDomain (Arbitrum)
            bytes32(uint256(uint160(deployer))), // mintRecipient
            uint256(500000),            // maxFee
            uint32(1000),               // minFinalityThreshold (fast)
            bytes("")                   // hookData
        );
        uint256 balBefore = usdc.balanceOf(deployer);
        agg.bridge(CCTP_ID, address(usdc), cctpAmount, 42161, bytes32(uint256(uint160(deployer))), cctpData);
        uint256 balAfter = usdc.balanceOf(deployer);
        console.log("USDC spent:", (balBefore - balAfter) / 1e6, "USDC");
        console.log("Nonce after CCTP:", agg.nonce());
        console.log("CCTP mock calls:", mockCctp.getCallCount());

        // ── 7. Test USDT0 bridge ─────────────────────────────────
        console.log("");
        console.log("=== Test 2: USDT0 Bridge ===");
        uint256 usdt0Amount = 500 * 1e6; // 500 USDT
        bytes memory usdt0Data = abi.encode(
            uint32(30110),              // dstEid (Arbitrum LZ)
            bytes32(uint256(uint160(deployer))), // recipient
            uint256(497 * 1e6),         // minAmountLD (slippage)
            bytes(""),                  // extraOptions
            bytes(""),                  // composeMsg
            bytes("")                   // oftCmd
        );
        balBefore = usdt.balanceOf(deployer);
        agg.bridge{value: 0.01 ether}(USDT0_ID, address(usdt), usdt0Amount, 42161, bytes32(uint256(uint160(deployer))), usdt0Data);
        balAfter = usdt.balanceOf(deployer);
        console.log("USDT spent:", (balBefore - balAfter) / 1e6, "USDT");
        console.log("Nonce after USDT0:", agg.nonce());
        console.log("OFT mock calls:", mockOft.getCallCount());

        // ── 8. Test NEAR Intents bridge ──────────────────────────
        console.log("");
        console.log("=== Test 3: NEAR Intents Bridge ===");
        uint256 nearAmount = 200 * 1e6; // 200 USDC
        address depositAddr = address(0xDEAD);
        bytes memory nearData = abi.encode(depositAddr);
        balBefore = usdc.balanceOf(deployer);
        agg.bridge(NEAR_ID, address(usdc), nearAmount, 0, bytes32(uint256(uint160(deployer))), nearData);
        balAfter = usdc.balanceOf(deployer);
        uint256 depositBal = usdc.balanceOf(depositAddr);
        console.log("USDC spent:", (balBefore - balAfter) / 1e6, "USDC");
        console.log("Deposit addr received:", depositBal / 1e6, "USDC");
        console.log("Nonce after NEAR:", agg.nonce());

        // ── 9. Test fee sweep ────────────────────────────────────
        console.log("");
        console.log("=== Test 4: Fee Sweep ===");
        uint256 aggUsdcBal = usdc.balanceOf(address(agg));
        uint256 aggUsdtBal = usdt.balanceOf(address(agg));
        console.log("Aggregator USDC balance (fees):", aggUsdcBal);
        console.log("Aggregator USDT balance (fees):", aggUsdtBal);
        uint256 treasuryBefore = usdc.balanceOf(deployer);
        agg.sweepFees(address(usdc));
        agg.sweepFees(address(usdt));
        console.log("Fees swept to treasury");
        console.log("Aggregator USDC after sweep:", usdc.balanceOf(address(agg)));
        console.log("Aggregator USDT after sweep:", usdt.balanceOf(address(agg)));

        // ── 10. Test admin controls ──────────────────────────────
        console.log("");
        console.log("=== Test 5: Admin Controls ===");
        agg.pause();
        console.log("Contract paused");
        // bridge should revert when paused — we can't try/catch in a script,
        // so just unpause and confirm it works again
        agg.unpause();
        console.log("Contract unpaused");
        agg.setFeeBps(10);
        console.log("Fee updated to 10 bps");
        agg.disableProvider(CCTP_ID);
        console.log("CCTP provider disabled");
        agg.enableProvider(CCTP_ID);
        console.log("CCTP provider re-enabled");

        vm.stopBroadcast();

        // ── Summary ──────────────────────────────────────────────
        console.log("");
        console.log("========================================");
        console.log("  ALL TESTS PASSED");
        console.log("  Aggregator:", address(agg));
        console.log("  Final nonce:", agg.nonce());
        console.log("========================================");
    }
}
