import { execSync } from "child_process";

console.log("==================================================");
console.log("Starting 12-Hour Automated Scheduler (8:00 AM & 8:00 PM Manila Time)");
console.log("==================================================");

function getMsUntilNextTarget(): { ms: number; targetTimeStr: string } {
  const now = new Date();
  
  // Convert current time to Manila time (UTC+8)
  const manilaNowStr = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const manilaNow = new Date(manilaNowStr);

  const target8AM = new Date(manilaNow);
  target8AM.setHours(8, 0, 0, 0);

  const target8PM = new Date(manilaNow);
  target8PM.setHours(20, 0, 0, 0);

  let nextTarget: Date;
  if (manilaNow < target8AM) {
    nextTarget = target8AM;
  } else if (manilaNow < target8PM) {
    nextTarget = target8PM;
  } else {
    // Past 8 PM, set to 8 AM tomorrow
    nextTarget = new Date(target8AM);
    nextTarget.setDate(nextTarget.getDate() + 1);
  }

  const diffMs = nextTarget.getTime() - manilaNow.getTime();
  return { ms: diffMs, targetTimeStr: nextTarget.toLocaleTimeString("en-US", { timeZone: "Asia/Manila" }) };
}

function runLoop() {
  const { ms, targetTimeStr } = getMsUntilNextTarget();
  const utcNow = new Date().toUTCString();
  console.log(`\n⏳ Next scheduled tweet: 12:00 PM UTC / 00:00 UTC (Target: ${targetTimeStr} PHT / 12:00 UTC). Current UTC: ${utcNow}. Waiting ${Math.round(ms / 1000 / 60)} minutes...`);
  
  setTimeout(() => {
    console.log(`\n🚀 [${new Date().toUTCString()} / ${new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })} PHT] Triggering Scheduled 12-Hour Post...`);
    try {
      execSync("npx hardhat run scripts/run_agent.ts --network ritualTestnet", { stdio: "inherit" });
    } catch (err: any) {
      console.error("Error executing scheduled run_agent:", err.message || err);
    }
    // Schedule next run
    runLoop();
  }, ms);
}

runLoop();
