// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";

/**
 * @title ShadowIntentBook
 * @notice Encrypted swap intent registry — the privacy core of ShadowSwap.
 *
 * ## Privacy model
 * - **Private until execution:** amountIn and minAmountOut live as Nox handles.
 * - **Public by design:** token pair, user, deadline, status (needed for routing UX).
 * - **Batch windows:** intents join an open batch; sealing freezes membership so a
 *   batch executor can net same-pair flow and reduce size attribution.
 * - **Selective disclosure:** intent owner can grant an auditor `addViewer` rights
 *   on amount handles without making them world-public.
 *
 * ## Lifecycle
 * Pending → (optional) Batched → Executed | Cancelled
 */
contract ShadowIntentBook {
    // ============ Types ============

    enum IntentStatus {
        None,
        Pending,
        Batched,
        Executed,
        Cancelled
    }

    struct Intent {
        address user;
        address cTokenIn; // ERC-7984 wrapper for tokenIn
        address cTokenOut; // ERC-7984 wrapper for tokenOut
        address tokenIn; // underlying ERC-20
        address tokenOut; // underlying ERC-20
        euint256 amountIn;
        euint256 minAmountOut;
        uint64 deadline;
        uint64 createdAt;
        uint32 batchId;
        IntentStatus status;
    }

    struct Batch {
        uint64 openAt;
        uint64 sealAt; // 0 while open
        bool isSealed;
        bool isExecuted;
        uint256[] intentIds;
    }

    // ============ Storage ============

    address public owner;
    address public executor; // ShadowSwapExecutor
    uint64 public batchWindow; // seconds

    uint256 public nextIntentId = 1;
    uint32 public currentBatchId = 1;

    mapping(uint256 => Intent) public intents;
    mapping(uint32 => Batch) public batches;
    mapping(address => uint256[]) private _userIntents;

    // ============ Events ============

    event ExecutorUpdated(address indexed executor);
    event BatchWindowUpdated(uint64 window);
    event IntentSubmitted(
        uint256 indexed intentId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint32 indexed batchId,
        uint64 deadline
    );
    event IntentCancelled(uint256 indexed intentId, address indexed user);
    event AuditorGranted(uint256 indexed intentId, address indexed auditor);
    event BatchSealed(uint32 indexed batchId, uint256 intentCount);
    event BatchOpened(uint32 indexed batchId, uint64 openAt);
    event IntentExecuted(uint256 indexed intentId, uint32 indexed batchId);

    // ============ Errors ============

    error NotOwner();
    error NotExecutor();
    error NotIntentOwner();
    error BadStatus();
    error BatchSealedAlready();
    error BatchNotSealed();
    error EmptyBatch();
    error ZeroAddress();
    error BadDeadline();
    error SameToken();

    // ============ Modifiers ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    // ============ Constructor ============

    constructor(uint64 batchWindow_) {
        owner = msg.sender;
        batchWindow = batchWindow_;
        batches[currentBatchId].openAt = uint64(block.timestamp);
        emit BatchOpened(currentBatchId, uint64(block.timestamp));
    }

    // ============ Admin ============

    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        emit ExecutorUpdated(executor_);
    }

    function setBatchWindow(uint64 window_) external onlyOwner {
        batchWindow = window_;
        emit BatchWindowUpdated(window_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ============ Intent submission ============

    /**
     * @notice Submit a private swap intent with encrypted size and min-out.
     * @dev User should already hold cTokenIn balance. Execution path pulls via operator.
     * @param cTokenIn Confidential wrapper of the input asset
     * @param cTokenOut Confidential wrapper of the output asset
     * @param tokenIn Underlying ERC-20 in
     * @param tokenOut Underlying ERC-20 out
     * @param encryptedAmountIn Nox external handle for amount in
     * @param amountProof Input proof for amount
     * @param encryptedMinOut Nox external handle for minimum out
     * @param minOutProof Input proof for min out
     * @param deadline Intent expiry
     */
    function submitIntent(
        address cTokenIn,
        address cTokenOut,
        address tokenIn,
        address tokenOut,
        externalEuint256 encryptedAmountIn,
        bytes calldata amountProof,
        externalEuint256 encryptedMinOut,
        bytes calldata minOutProof,
        uint64 deadline
    ) external returns (uint256 intentId) {
        if (tokenIn == tokenOut) revert SameToken();
        if (cTokenIn == address(0) || cTokenOut == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp) revert BadDeadline();

        // Ensure we have an open batch; auto-rotate if window elapsed and current has intents
        _maybeRotateBatch();

        euint256 amountIn = Nox.fromExternal(encryptedAmountIn, amountProof);
        euint256 minOut = Nox.fromExternal(encryptedMinOut, minOutProof);

        // Persist ACL: book + user can operate / view these handles
        Nox.allowThis(amountIn);
        Nox.allow(amountIn, msg.sender);
        Nox.allowThis(minOut);
        Nox.allow(minOut, msg.sender);

        intentId = nextIntentId++;
        uint32 batchId = currentBatchId;

        intents[intentId] = Intent({
            user: msg.sender,
            cTokenIn: cTokenIn,
            cTokenOut: cTokenOut,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minOut,
            deadline: deadline,
            createdAt: uint64(block.timestamp),
            batchId: batchId,
            status: IntentStatus.Pending
        });

        batches[batchId].intentIds.push(intentId);
        _userIntents[msg.sender].push(intentId);

        emit IntentSubmitted(intentId, msg.sender, tokenIn, tokenOut, batchId, deadline);
    }

    /**
     * @notice Cancel a pending intent before it is sealed into an executed batch.
     */
    function cancelIntent(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.user != msg.sender) revert NotIntentOwner();
        if (intent.status != IntentStatus.Pending) revert BadStatus();
        intent.status = IntentStatus.Cancelled;
        emit IntentCancelled(intentId, msg.sender);
    }

    /**
     * @notice Grant an auditor decrypt rights on this intent's amount handles.
     * @dev Does not transfer spending rights — viewer only.
     */
    function grantAuditor(uint256 intentId, address auditor) external {
        Intent storage intent = intents[intentId];
        if (intent.user != msg.sender) revert NotIntentOwner();
        if (auditor == address(0)) revert ZeroAddress();
        if (
            intent.status != IntentStatus.Pending && intent.status != IntentStatus.Batched
        ) revert BadStatus();

        Nox.addViewer(intent.amountIn, auditor);
        Nox.addViewer(intent.minAmountOut, auditor);
        emit AuditorGranted(intentId, auditor);
    }

    // ============ Batch control ============

    /**
     * @notice Seal the current batch (permissionless after window, or owner anytime).
     */
    function sealCurrentBatch() external returns (uint32 sealedId) {
        Batch storage batch = batches[currentBatchId];
        if (batch.isSealed) revert BatchSealedAlready();

        bool windowElapsed = block.timestamp >= batch.openAt + batchWindow;
        if (!(windowElapsed || msg.sender == owner || msg.sender == executor)) {
            revert BatchNotSealed(); // reuse: not allowed yet
        }
        if (batch.intentIds.length == 0) revert EmptyBatch();

        sealedId = currentBatchId;
        batch.isSealed = true;
        batch.sealAt = uint64(block.timestamp);

        // Mark live intents as Batched
        uint256[] storage ids = batch.intentIds;
        for (uint256 i = 0; i < ids.length; i++) {
            Intent storage intent = intents[ids[i]];
            if (intent.status == IntentStatus.Pending) {
                intent.status = IntentStatus.Batched;
            }
        }

        emit BatchSealed(sealedId, ids.length);

        // Open next batch
        currentBatchId += 1;
        batches[currentBatchId].openAt = uint64(block.timestamp);
        emit BatchOpened(currentBatchId, uint64(block.timestamp));
    }

    /**
     * @notice Mark intents executed (called by ShadowSwapExecutor after settlement).
     */
    function markExecuted(uint256[] calldata intentIds, uint32 batchId) external onlyExecutor {
        for (uint256 i = 0; i < intentIds.length; i++) {
            Intent storage intent = intents[intentIds[i]];
            if (intent.status != IntentStatus.Batched && intent.status != IntentStatus.Pending) {
                continue;
            }
            intent.status = IntentStatus.Executed;
            emit IntentExecuted(intentIds[i], batchId);
        }
        batches[batchId].isExecuted = true;
    }

    /**
     * @notice Allow executor + cTokenIn to use intent amount handles during settlement.
     * @dev cTokenIn must be ACL'd: confidentialTransferFrom runs Nox ops as the token contract
     *      and reverts NotAllowed(handle, cToken) otherwise.
     */
    function allowExecutorOnIntent(uint256 intentId) external onlyExecutor {
        Intent storage intent = intents[intentId];
        Nox.allow(intent.amountIn, executor);
        Nox.allow(intent.minAmountOut, executor);
        Nox.allow(intent.amountIn, intent.cTokenIn);
        Nox.allowTransient(intent.amountIn, executor);
        Nox.allowTransient(intent.minAmountOut, executor);
        Nox.allowTransient(intent.amountIn, intent.cTokenIn);
    }

    // ============ Views ============

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function getBatchIntentIds(uint32 batchId) external view returns (uint256[] memory) {
        return batches[batchId].intentIds;
    }

    function getUserIntents(address user) external view returns (uint256[] memory) {
        return _userIntents[user];
    }

    function amountInHandle(uint256 intentId) external view returns (euint256) {
        return intents[intentId].amountIn;
    }

    function minOutHandle(uint256 intentId) external view returns (euint256) {
        return intents[intentId].minAmountOut;
    }

    // ============ Internal ============

    function _maybeRotateBatch() internal {
        Batch storage batch = batches[currentBatchId];
        if (batch.isSealed) return;
        if (batch.intentIds.length == 0) return;
        if (block.timestamp < batch.openAt + batchWindow) return;

        // Auto-seal when window ends and someone submits next intent
        batch.isSealed = true;
        batch.sealAt = uint64(block.timestamp);
        uint256[] storage ids = batch.intentIds;
        for (uint256 i = 0; i < ids.length; i++) {
            Intent storage intent = intents[ids[i]];
            if (intent.status == IntentStatus.Pending) {
                intent.status = IntentStatus.Batched;
            }
        }
        emit BatchSealed(currentBatchId, ids.length);

        currentBatchId += 1;
        batches[currentBatchId].openAt = uint64(block.timestamp);
        emit BatchOpened(currentBatchId, uint64(block.timestamp));
    }
}
