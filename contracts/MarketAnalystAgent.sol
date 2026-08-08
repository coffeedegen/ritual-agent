// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
    function balanceOf(address user) external view returns (uint256);
}

/// @title MarketAnalystAgent
/// @notice Consumer contract on Ritual Chain for a 24/7 Persistent Market Analyst Agent with Liveness Heartbeat
contract MarketAnalystAgent {
    // Precompile & System Contract Addresses on Ritual Chain (Chain ID 1979)
    address public constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address public constant PERSISTENT_AGENT_PRECOMPILE = 0x0000000000000000000000000000000000000820;
    address public constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;
    address public constant ASYNC_DELIVERY_SENDER = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    address public owner;
    uint256 public lastHeartbeatTimestamp;
    
    struct AnalysisLog {
        uint256 timestamp;
        string marketData;
        string tweetContent;
        bool postedSuccessfully;
    }

    mapping(bytes32 => AnalysisLog) public analysisHistory;
    bytes32[] public analysisJobIds;

    event MarketAnalysisRequested(bytes32 indexed jobId, uint256 timestamp);
    event MarketDataReceived(bytes32 indexed jobId, string marketData);
    event TweetPosted(bytes32 indexed jobId, string tweetContent, bool success);
    event WalletFunded(uint256 amount, uint256 lockDuration);
    event AgentHeartbeat(uint256 indexed timestamp, uint256 ritualWalletBalance, string status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    modifier onlyAsyncSystem() {
        require(msg.sender == ASYNC_DELIVERY_SENDER, "Only AsyncDelivery system can callback");
        _;
    }

    constructor() {
        owner = msg.sender;
        lastHeartbeatTimestamp = block.timestamp;
        emit AgentHeartbeat(block.timestamp, 0, "INITIALIZED");
    }

    /// @notice Record internal heartbeat timestamp and check fee buffer
    function recordHeartbeat() internal {
        lastHeartbeatTimestamp = block.timestamp;
        uint256 walletBal = 0;
        try IRitualWallet(RITUAL_WALLET).balanceOf(tx.origin) returns (uint256 bal) {
            walletBal = bal;
        } catch {}

        string memory status = walletBal < 0.05 ether ? "WARNING_LOW_FEE_BALANCE" : "HEALTHY";
        emit AgentHeartbeat(block.timestamp, walletBal, status);
    }

    /// @notice Check if the persistent agent has pulsed within the last 24 hours
    function isAlive() external view returns (bool) {
        if (lastHeartbeatTimestamp == 0) return false;
        return (block.timestamp - lastHeartbeatTimestamp) < 24 hours;
    }

    /// @notice Fund RitualWallet fee buffer for execution
    /// @param lockDuration Number of blocks to lock fees (e.g. 100,000 blocks for dev iteration)
    function fundRitualWallet(uint256 lockDuration) external payable onlyOwner {
        require(msg.value > 0, "Must send RITUAL native token");
        IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(lockDuration);
        recordHeartbeat();
        emit WalletFunded(msg.value, lockDuration);
    }

    /// @notice Request HTTP Market Data fetch via precompile 0x0801 (13-field ABI)
    function requestMarketData(
        address executor,
        uint256 ttl,
        string calldata url,
        bytes[] calldata encryptedSecrets
    ) public onlyOwner returns (bytes32 jobId) {
        recordHeartbeat();

        bytes[] memory emptySignatures = new bytes[](0);
        string[] memory emptyHeaders = new string[](0);
        
        bytes memory payload = abi.encode(
            executor,            // 1. executor address
            encryptedSecrets,    // 2. encryptedSecrets bytes[]
            ttl,                 // 3. ttl uint256
            emptySignatures,     // 4. secretSignatures bytes[]
            bytes(""),           // 5. userPublicKey bytes
            url,                 // 6. url string
            uint8(1),            // 7. method uint8 (1 = GET)
            emptyHeaders,        // 8. headerKeys string[]
            emptyHeaders,        // 9. headerValues string[]
            bytes(""),           // 10. body bytes
            uint256(0),          // 11. dkmsKeyIndex uint256
            uint8(0),            // 12. dkmsKeyFormat uint8
            false                // 13. piiEnabled bool
        );

        (bool ok, bytes memory result) = HTTP_PRECOMPILE.call(payload);
        require(ok, "HTTP precompile execution failed");

        (bytes memory simmedInput, ) = abi.decode(result, (bytes, bytes));
        jobId = keccak256(simmedInput);
        analysisJobIds.push(jobId);
        
        emit MarketAnalysisRequested(jobId, block.timestamp);
        return jobId;
    }

    /// @notice Atomic Batch Execution Skill: Bundles RitualWallet fee funding & HTTP precompile request into 1 atomic transaction.
    function executeBatchDataPipeline(
        address executor,
        uint256 ttl,
        string calldata url,
        bytes[] calldata encryptedSecrets,
        uint256 lockDuration
    ) external payable onlyOwner returns (bytes32 jobId) {
        if (msg.value > 0) {
            IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(lockDuration);
            emit WalletFunded(msg.value, lockDuration);
        }
        return requestMarketData(executor, ttl, url, encryptedSecrets);
    }

    /// @notice Async Callback receiver for Market Data fetch
    function onMarketDataReceived(bytes32 jobId, bytes calldata responseData) external onlyAsyncSystem {
        recordHeartbeat();

        (uint16 statusCode, , , bytes memory body, string memory errorMsg) = abi.decode(
            responseData,
            (uint16, string[], string[], bytes, string)
        );

        require(bytes(errorMsg).length == 0, errorMsg);
        require(statusCode == 200, "HTTP status not OK");

        string memory marketData = string(body);
        analysisHistory[jobId].timestamp = block.timestamp;
        analysisHistory[jobId].marketData = marketData;

        emit MarketDataReceived(jobId, marketData);
    }

    /// @notice Utility to get total logged analysis cycles
    function getAnalysisCount() external view returns (uint256) {
        return analysisJobIds.length;
    }

    /// @notice Record completed tweet post result for a job
    function recordTweetPost(bytes32 jobId, string calldata tweetContent, bool success) external onlyOwner {
        recordHeartbeat();
        analysisHistory[jobId].tweetContent = tweetContent;
        analysisHistory[jobId].postedSuccessfully = success;
        if (analysisHistory[jobId].timestamp == 0) {
            analysisHistory[jobId].timestamp = block.timestamp;
        }
        emit TweetPosted(jobId, tweetContent, success);
    }

    receive() external payable {}
}
