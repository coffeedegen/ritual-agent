import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("==================================================");
  console.log("Checking Persistent Market Analyst Agent Balances & Status...");
  console.log("==================================================");

  const [signer] = await ethers.getSigners();
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("❌ ERROR: CONTRACT_ADDRESS not set in .env file.");
    process.exit(1);
  }

  const AgentContract = await ethers.getContractAt("MarketAnalystAgent", contractAddress, signer);

  // 1. Native Gas Balances
  const eoaBalance = await ethers.provider.getBalance(signer.address);
  const contractBalance = await ethers.provider.getBalance(contractAddress);

  // 2. RitualWallet Fee Escrow Balances
  const walletAddress = process.env.RITUAL_WALLET || "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
  const walletAbi = [
    "function balanceOf(address user) external view returns (uint256)",
    "function lockUntil(address user) external view returns (uint256)"
  ];
  const ritualWallet = new ethers.Contract(walletAddress, walletAbi, signer);

  const eoaEscrowBalance = await ritualWallet.balanceOf(signer.address);
  const eoaLockUntil = await ritualWallet.lockUntil(signer.address);

  const alive = await AgentContract.isAlive();
  const heartbeatTs = await AgentContract.lastHeartbeatTimestamp();
  const analysisCount = await AgentContract.getAnalysisCount();

  console.log("Operator EOA Address:", signer.address);
  console.log("Agent Contract Address:", contractAddress);
  console.log("--------------------------------------------------");
  console.log("1. Native RITUAL Gas Balance (EOA):", ethers.formatEther(eoaBalance), "RITUAL");
  console.log("2. Native RITUAL Gas Balance (Contract):", ethers.formatEther(contractBalance), "RITUAL");
  console.log("3. RitualWallet Fee Escrow Balance (EOA):", ethers.formatEther(eoaEscrowBalance), "RITUAL");
  console.log("4. RitualWallet Fee Lock Expiry Block:", eoaLockUntil.toString());
  console.log("--------------------------------------------------");
  console.log("Is Agent Currently Alive?:", alive ? "✅ YES (ACTIVE)" : "⚠️ AWAITING FIRST CYCLE / REFRESH");
  console.log("Total Jobs Requested:", analysisCount.toString());
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
