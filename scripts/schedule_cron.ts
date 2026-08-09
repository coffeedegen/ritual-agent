import { spawn } from "child_process";

console.log("==================================================");
console.log("Starting 12-Hour Automated Scheduler (8:00 AM & 8:00 PM Manila Time)");
console.log("==================================================");

function getMsUntilNextTarget(): { ms: number; targetTimeStr: string } {
  const now = new Date();
  
  // Manila is UTC+8
  const manilaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = manilaNow.getUTCFullYear();
  const month = manilaNow.getUTCMonth();
  const date = manilaNow.getUTCDate();

  const target8AM = new Date(Date.UTC(year, month, date, 8, 0, 0, 0));
  const target8PM = new Date(Date.UTC(year, month, date, 20, 0, 0, 0));

  let nextTarget: Date;
  if (manilaNow < target8AM) {
    nextTarget = target8AM;
  } else if (manilaNow < target8PM) {
    nextTarget = target8PM;
  } else {
    nextTarget = new Date(Date.UTC(year, month, date + 1, 8, 0, 0, 0));
  }

  const diffMs = nextTarget.getTime() - manilaNow.getTime();
  const actualTargetUtc = new Date(nextTarget.getTime() - 8 * 60 * 60 * 1000);
  const targetTimeStr = actualTargetUtc.toLocaleTimeString("en-US", { timeZone: "Asia/Manila" });

  return { ms: diffMs, targetTimeStr };
}

function executeAgentRun(): Promise<void> {
  return new Promise((resolve) => {
    console.log(`\n🚀 [${new Date().toUTCString()} / ${new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })} PHT] Triggering Scheduled 12-Hour Post...`);
    
    const child = spawn("npx", ["hardhat", "run", "scripts/run_agent.ts", "--network", "ritualTestnet"], {
      stdio: "inherit",
      shell: true,
    });

    let finished = false;

    // Safety timeout of 3 minutes (180,000 ms)
    const timeoutTimer = setTimeout(() => {
      if (!finished) {
        finished = true;
        console.error("⚠️ Scheduled run_agent timed out after 3 minutes. Force killing process...");
        child.kill("SIGKILL");
        resolve();
      }
    }, 3 * 60 * 1000);

    child.on("exit", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutTimer);
        if (code === 0) {
          console.log("✅ Scheduled run_agent finished successfully.");
        } else {
          console.error(`❌ Scheduled run_agent exited with code ${code}.`);
        }
        resolve();
      }
    });

    child.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutTimer);
        console.error("❌ Failed to start run_agent process:", err);
        resolve();
      }
    });
  });
}

async function runLoop() {
  const { ms, targetTimeStr } = getMsUntilNextTarget();
  const utcNow = new Date().toUTCString();
  console.log(`\n⏳ Next scheduled tweet: (Target: ${targetTimeStr} PHT). Current UTC: ${utcNow}. Waiting ${Math.round(ms / 1000 / 60)} minutes...`);
  
  setTimeout(async () => {
    await executeAgentRun();
    // Schedule next run after execution completes
    runLoop();
  }, ms);
}

runLoop();
