import { ethers } from "hardhat";
import { encrypt, ECIES_CONFIG } from "eciesjs";
import * as dotenv from "dotenv";

dotenv.config();

// Critical Ritual Requirement: Nonce length MUST be 12 bytes for TEE executor decryption
ECIES_CONFIG.symmetricNonceLength = 12;

async function main() {
  console.log("==================================================");
  console.log("Encrypting Agent Secrets & Binding Access Control...");
  console.log("==================================================");

  const [deployer] = await ethers.getSigners();
  console.log("Operator Wallet:", deployer.address);

  const teeRegistryAddress = process.env.TEE_SERVICE_REGISTRY || "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";
  const secretsAcAddress = process.env.SECRETS_ACCESS_CONTROL || "0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD";
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("❌ ERROR: CONTRACT_ADDRESS not set in .env file. Please deploy your contract first.");
    process.exit(1);
  }

  console.log("Using Deployed Agent Contract:", contractAddress);

  // 1. Fetch TEE Executor Public Key from TEEServiceRegistry using exact TEEServiceContext struct
  const teeRegistryAbi = [
    "function getServicesByCapability(uint8 capability, bool checkValidity) external view returns (tuple(tuple(address paymentAddress, address teeAddress, uint8 teeType, bytes publicKey, string endpoint, bytes32 certPubKeyHash, uint8 capability) node, bool isValid, bytes32 workloadId)[])"
  ];

  const teeRegistry = new ethers.Contract(teeRegistryAddress, teeRegistryAbi, deployer);
  
  console.log("Fetching active TEE executor public key from registry...");
  // Capability 0 = HTTP_CALL
  const services = await teeRegistry.getServicesByCapability(0, true);
  
  if (!services || services.length === 0) {
    console.error("❌ ERROR: No active TEE executors found for HTTP_CALL capability.");
    process.exit(1);
  }

  const executor = services[0];
  const teeAddress = executor.node.teeAddress;
  const executorPublicKey = executor.node.publicKey;

  console.log("Target TEE Executor Address:", teeAddress);
  console.log("Executor Public Key Length:", executorPublicKey.length);

  // 2. Prepare JSON payload of secret API keys
  const secretsPayload = {
    TWITTER_KEYS: JSON.stringify({
      api_key: process.env.TWITTER_API_KEY,
      api_secret: process.env.TWITTER_API_SECRET,
      access_token: process.env.TWITTER_ACCESS_TOKEN,
      access_secret: process.env.TWITTER_ACCESS_SECRET,
    }),
    DA_KEYS: JSON.stringify({
      pinata_jwt: process.env.DA_PINATA_JWT,
    })
  };

  const secretsJsonStr = JSON.stringify(secretsPayload);
  const secretsBuffer = Buffer.from(secretsJsonStr, "utf-8");

  // Format public key (remove 0x prefix if needed for eciesjs)
  const pubKeyClean = executorPublicKey.startsWith("0x") ? executorPublicKey.slice(2) : executorPublicKey;

  console.log("Encrypting secrets using ECIES (nonce=12)...");
  const encryptedBytes = encrypt(Buffer.from(pubKeyClean, "hex"), secretsBuffer);
  const encryptedHex = "0x" + encryptedBytes.toString("hex");

  console.log("✅ Secrets Encrypted Successfully! Encrypted Byte Count:", encryptedBytes.length);

  // 3. Compute Hash & Grant Access via SecretsAccessControl
  const secretsHash = ethers.keccak256(encryptedHex);
  console.log("Computed Secrets Hash:", secretsHash);

  const secretsAcAbi = [
    "function grantAccess(address delegate, bytes32 secretsHash, uint256 expiresAt, tuple(string[] allowedDestinations, string[] allowedMethods, string[] allowedPaths, string[] allowedQueryParams, string[] allowedHeaders, string secretLocation, string bodyFormat) policy) external"
  ];

  const secretsAc = new ethers.Contract(secretsAcAddress, secretsAcAbi, deployer);

  const currentBlock = await ethers.provider.getBlockNumber();
  const expiresAt = currentBlock + 100000; // ~100k blocks (~9.7 hours)

  const emptyPolicy = {
    allowedDestinations: [],
    allowedMethods: [],
    allowedPaths: [],
    allowedQueryParams: [],
    allowedHeaders: [],
    secretLocation: "",
    bodyFormat: ""
  };

  console.log(`Granting access to delegate contract ${contractAddress} until block ${expiresAt}...`);

  try {
    const tx = await secretsAc.grantAccess(contractAddress, secretsHash, expiresAt, emptyPolicy);
    console.log("Grant Access TX Submitted:", tx.hash);
    await tx.wait();
    console.log("✅ Access Granted! Delegate contract is authorized to decrypt secrets inside TEE.");
  } catch (err: any) {
    console.warn("⚠️ Note on Grant Access:", err.message || err);
  }

  console.log("\n==================================================");
  console.log("Encrypted Secrets Hex Output:");
  console.log(encryptedHex);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
