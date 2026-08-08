import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("==================================================");
  console.log("Deploying MarketAnalystAgent to Ritual Chain (ID 1979)...");
  console.log("==================================================");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer Wallet:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Wallet Balance:", ethers.formatEther(balance), "RITUAL");

  if (balance === 0n) {
    console.warn("⚠️ WARNING: Deployer balance is 0 RITUAL. Fund your wallet at https://faucet.ritualfoundation.org");
  }

  // 1. Deploy Consumer Contract
  const AgentFactory = await ethers.getContractFactory("MarketAnalystAgent");
  const agentContract = await AgentFactory.deploy();
  await agentContract.waitForDeployment();

  const contractAddress = await agentContract.getAddress();
  console.log("\n✅ MarketAnalystAgent deployed to:", contractAddress);

  // 2. Output verification info
  console.log("\nNext Steps:");
  console.log("1. Copy .env.example to .env and fill in your Twitter API keys and Pinata/HF token.");
  console.log("2. Fund the contract fee buffer by calling agentContract.fundRitualWallet(100000, { value: parseEther('1.0') }).");
  console.log("3. Run npm run run-agent to trigger your first market analysis loop!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
