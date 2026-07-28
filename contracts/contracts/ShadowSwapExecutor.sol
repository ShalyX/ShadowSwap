// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    Nox,
    euint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {IERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC20ToERC7984Wrapper.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {ShadowIntentBook} from "./ShadowIntentBook.sol";

/**
 * @title ShadowSwapExecutor
 * @notice Settles Shadow intents against a public AMM (SimpleAMM or Uniswap V2).
 *
 * ## Settlement flow (solo or batch)
 * 1. User set `ShadowSwapExecutor` as operator on cTokenIn.
 * 2. Executor pulls confidential amount (handle already on intent) via confidentialTransferFrom.
 * 3. Executor unwraps cToken → ERC-20 (publicDecrypt + finalizeUnwrap) — **size becomes public here**.
 * 4. Executor swaps on the public AMM path.
 * 5. Executor wraps output ERC-20 → cTokenOut and confidential-transfers to user.
 *
 * ## Why this is still valuable privacy
 * - Intent book keeps sizes encrypted while orders wait / batch.
 * - Same-pair aggregation collapses multiple intents into fewer pool touches.
 * - Encrypted minOut prevents front-running the limit until execution.
 * - Auditor ACL works pre-execution without world-public amounts.
 *
 * ## Honesty
 * Uniswap (and any transparent AMM) requires plaintext amounts at swap time.
 * ShadowSwap does not claim permanent size secrecy after settlement — it claims
 * **pre-trade parameter privacy + private balances after re-shield**.
 */
contract ShadowSwapExecutor {
    using SafeERC20 for IERC20;

    // ============ Storage ============

    address public owner;
    mapping(address => bool) public authorizedSolvers;
    ShadowIntentBook public intentBook;
    ISwapAdapter public swapAdapter;
    /// @notice Last amount handle pulled for an intent (event-parse fallback).
    mapping(uint256 => euint256) public lastPulledAmount;
    mapping(uint256 => euint256) public unwrapRequestForIntent;
    mapping(uint256 => uint256) private _finalizedAmountIn;
    mapping(uint256 => bool) private _finalizedAmountReady;
    mapping(uint256 => bool) public settlementStarted;

    // ============ Events ============

    event SwapAdapterUpdated(address indexed adapter);
    event IntentBookUpdated(address indexed book);
    event SolverAuthorizationUpdated(address indexed solver, bool authorized);
    event SoloSwapExecuted(
        uint256 indexed intentId,
        address indexed user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event BatchSwapExecuted(
        uint32 indexed batchId,
        address tokenIn,
        address tokenOut,
        uint256 netAmountIn,
        uint256 netAmountOut,
        uint256 intentCount
    );
    /// @notice Confidential funds pulled from user for settlement (size still encrypted).
    event ConfidentialPulled(
        uint256 indexed intentId,
        address indexed from,
        address indexed cTokenIn,
        euint256 amount
    );
    /// @notice Unwrap started; `unwrapRequestId` is publicly decryptable and must be finalized.
    event UnwrapStarted(
        uint256 indexed intentId,
        address indexed cTokenIn,
        euint256 unwrapRequestId
    );
    event UnwrapFinalized(uint256 indexed intentId, address indexed cTokenIn, euint256 unwrapRequestId);
    event IntentRefunded(uint256 indexed intentId, address indexed user, uint256 clearAmount);

    // ============ Errors ============

    error NotOwner();
    error UnauthorizedSolver();
    error UnauthorizedSettler();
    error ZeroAddress();
    error IntentNotReady();
    error IntentExpired();
    error IntentMismatch();
    error DuplicateIntent();
    error UnwrapNotFinalized();
    error IntentAlreadyPulled();
    error BadMinOut();
    error TransferFailed();
    error LengthMismatch();
    error AssetPairMismatch();
    error RefundNotReady();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlySolver() {
        if (!authorizedSolvers[msg.sender]) revert UnauthorizedSolver();
        _;
    }

    constructor(address intentBook_, address swapAdapter_) {
        owner = msg.sender;
        authorizedSolvers[msg.sender] = true;
        intentBook = ShadowIntentBook(intentBook_);
        swapAdapter = ISwapAdapter(swapAdapter_);
    }

    function setSolver(address solver, bool authorized) external onlyOwner {
        if (solver == address(0)) revert ZeroAddress();
        authorizedSolvers[solver] = authorized;
        emit SolverAuthorizationUpdated(solver, authorized);
    }

    function setSwapAdapter(address adapter_) external onlyOwner {
        if (adapter_ == address(0)) revert ZeroAddress();
        swapAdapter = ISwapAdapter(adapter_);
        emit SwapAdapterUpdated(adapter_);
    }

    function setIntentBook(address book_) external onlyOwner {
        if (book_ == address(0)) revert ZeroAddress();
        intentBook = ShadowIntentBook(book_);
        emit IntentBookUpdated(book_);
    }

    /**
     * @notice Execute a single intent end-to-end (demo / solo path).
     * @dev Off-chain prep required:
     *  - User setOperator(this, until)
     *  - Pull confidential funds, start unwrap, publicDecrypt unwrap handle
     *  - publicDecrypt the submitted minOut handle and provide its Nox proof
     *
     * The finalized input amount is stored by the proof-verified unwrap path, and the
     * minimum output is derived from the submitted encrypted handle's public-decrypt
     * proof. The UI orchestrates these multi-transaction Nox flows.
     */
    function executeSoloAfterUnwrap(
        uint256 intentId,
        bytes calldata minOutDecryptProof,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        _validateIntentAssets(intent);
        if (msg.sender != intent.user && !authorizedSolvers[msg.sender]) {
            revert UnauthorizedSettler();
        }
        if (intent.status != ShadowIntentBook.IntentStatus.Settling) revert IntentNotReady();
        uint256 amountInClear = _finalizedAmountIn[intentId];
        if (!_finalizedAmountReady[intentId] || amountInClear == 0) revert UnwrapNotFinalized();
        uint256 minOutClear = Nox.publicDecrypt(intent.minAmountOut, minOutDecryptProof);
        if (minOutClear == 0) revert BadMinOut();
        delete _finalizedAmountIn[intentId];
        delete _finalizedAmountReady[intentId];

        address user = intent.user;
        address cTokenOut = intent.cTokenOut;
        address tokenIn = intent.tokenIn;
        address tokenOut = intent.tokenOut;

        // Swap public ERC-20 held by this contract (after unwrap finalize)
        IERC20(tokenIn).forceApprove(address(swapAdapter), amountInClear);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = swapAdapter.swapExactTokensForTokens(
            amountInClear,
            minOutClear,
            path,
            address(this),
            deadline
        );
        amountOut = amounts[amounts.length - 1];
        if (amountOut < minOutClear) revert BadMinOut();

        // Re-shield output into confidential token for the user
        IERC20(tokenOut).forceApprove(cTokenOut, amountOut);
        IERC20ToERC7984Wrapper(cTokenOut).wrap(user, amountOut);

        uint256[] memory ids = new uint256[](1);
        ids[0] = intentId;
        intentBook.markExecuted(ids, intent.batchId);

        emit SoloSwapExecuted(intentId, user, tokenIn, tokenOut, amountInClear, amountOut);
    }

    /**
     * @notice Batch-settle same-pair intents that already unwrapped into this contract.
     * @dev Netting v1: sum amountIns, one swap, pro-rata outputs by amountIn share.
     */
    function executeBatchSamePair(
        uint32 batchId,
        uint256[] calldata intentIds,
        bytes[] calldata minOutDecryptProofs,
        uint256 deadline
    ) external onlySolver returns (uint256 netOut) {
        uint256 n = intentIds.length;
        if (minOutDecryptProofs.length != n) revert LengthMismatch();
        if (n == 0) revert IntentNotReady();

        ShadowIntentBook.Intent memory firstIntent = intentBook.getIntent(intentIds[0]);
        address cTokenOut = firstIntent.cTokenOut;
        address tokenIn = firstIntent.tokenIn;
        address tokenOut = firstIntent.tokenOut;
        address[] memory users = new address[](n);
        uint256[] memory amountIns = new uint256[](n);
        uint256[] memory minOuts = new uint256[](n);
        uint256 netIn;
        uint256 maxMinOut; // conservative: require out >= sum(minOuts)
        for (uint256 i = 0; i < n; i++) {
            ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentIds[i]);
            _validateIntentAssets(intent);
            uint256 amountIn = _finalizedAmountIn[intentIds[i]];
            if (
                intent.status != ShadowIntentBook.IntentStatus.Settling ||
                intent.batchId != batchId ||
                intent.cTokenOut != cTokenOut ||
                intent.tokenIn != tokenIn ||
                intent.tokenOut != tokenOut ||
                !_finalizedAmountReady[intentIds[i]] ||
                amountIn == 0
            ) revert IntentMismatch();
            for (uint256 j = 0; j < i; j++) {
                if (intentIds[j] == intentIds[i]) revert DuplicateIntent();
            }
            uint256 minOut = Nox.publicDecrypt(
                intent.minAmountOut,
                minOutDecryptProofs[i]
            );
            if (minOut == 0) revert BadMinOut();
            users[i] = intent.user;
            amountIns[i] = amountIn;
            minOuts[i] = minOut;
            delete _finalizedAmountIn[intentIds[i]];
            delete _finalizedAmountReady[intentIds[i]];
            netIn += amountIn;
            maxMinOut += minOut;
        }

        IERC20(tokenIn).forceApprove(address(swapAdapter), netIn);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = swapAdapter.swapExactTokensForTokens(
            netIn,
            maxMinOut,
            path,
            address(this),
            deadline
        );
        netOut = amounts[amounts.length - 1];
        if (netOut < maxMinOut) revert BadMinOut();

        // Pro-rata distribution of output into confidential balances
        uint256 distributed;
        for (uint256 i = 0; i < n; i++) {
            uint256 share = (i == n - 1)
                ? (netOut - distributed)
                : (netOut * amountIns[i]) / netIn;
            if (share < minOuts[i]) revert BadMinOut();
            distributed += share;
            IERC20(tokenOut).forceApprove(cTokenOut, share);
            IERC20ToERC7984Wrapper(cTokenOut).wrap(users[i], share);
        }

        intentBook.markExecuted(intentIds, batchId);
        emit BatchSwapExecuted(batchId, tokenIn, tokenOut, netIn, netOut, n);
    }


    /**
     * @notice Pull the intent's encrypted amountIn from the user into this contract.
     * @dev Preferred solo path: no re-encryption of clear size. Requires:
     *      - user setOperator(this, until) on intent.cTokenIn
     *      - intent Pending or Batched
     *      - allowExecutorOnIntent grants executor + cTokenIn ACL on amountIn
     *        (cToken needs ACL or Nox.transfer reverts NotAllowed(handle, cToken))
     */
    function pullFromIntent(uint256 intentId) external returns (euint256 transferred) {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        _validateIntentAssets(intent);
        if (msg.sender != intent.user && !authorizedSolvers[msg.sender]) {
            revert UnauthorizedSettler();
        }
        if (
            intent.status != ShadowIntentBook.IntentStatus.Pending &&
            intent.status != ShadowIntentBook.IntentStatus.Batched
        ) revert IntentNotReady();
        if (block.timestamp > intent.deadline) revert IntentExpired();
        if (settlementStarted[intentId]) revert IntentAlreadyPulled();
        settlementStarted[intentId] = true;
        intentBook.beginSettlement(intentId);

        // Grant executor + cToken ACL on intent handles for settlement
        intentBook.allowExecutorOnIntent(intentId);
        Nox.allowPublicDecryption(intent.minAmountOut);

        transferred = IERC7984(intent.cTokenIn).confidentialTransferFrom(
            intent.user,
            address(this),
            intent.amountIn
        );
        Nox.allowThis(transferred);
        // cToken must also be able to burn this handle on unwrap
        Nox.allow(transferred, intent.cTokenIn);
        lastPulledAmount[intentId] = transferred;
        emit ConfidentialPulled(intentId, intent.user, intent.cTokenIn, transferred);
    }

    /**
     * @notice Start unwrap using an on-chain handle already allowed to this contract
     *         (the handle returned by {pullFromIntent}).
     */
    function startUnwrapHeld(
        uint256 intentId,
        address cTokenIn,
        euint256 amount
    ) external returns (euint256 unwrapRequestId) {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        if (msg.sender != intent.user && !authorizedSolvers[msg.sender]) {
            revert UnauthorizedSettler();
        }
        if (
            intent.status != ShadowIntentBook.IntentStatus.Settling ||
            cTokenIn != intent.cTokenIn ||
            euint256.unwrap(amount) != euint256.unwrap(lastPulledAmount[intentId])
        ) revert IntentMismatch();
        unwrapRequestId = IERC20ToERC7984Wrapper(cTokenIn).unwrap(
            address(this),
            address(this),
            amount
        );
        unwrapRequestForIntent[intentId] = unwrapRequestId;
        emit UnwrapStarted(intentId, cTokenIn, unwrapRequestId);
    }


    /**
     * @notice Finalize unwrap and tag the intent id for UI/indexers.
     */
    function finalizeUnwrapForIntent(
        uint256 intentId,
        address cTokenIn,
        euint256 unwrapRequestId,
        bytes calldata decryptedAmountAndProof
    ) external {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        if (msg.sender != intent.user && !authorizedSolvers[msg.sender]) {
            revert UnauthorizedSettler();
        }
        if (
            intent.status != ShadowIntentBook.IntentStatus.Settling ||
            cTokenIn != intent.cTokenIn ||
            euint256.unwrap(unwrapRequestId) != euint256.unwrap(unwrapRequestForIntent[intentId])
        ) revert IntentMismatch();
        uint256 amountInClear = Nox.publicDecrypt(unwrapRequestId, decryptedAmountAndProof);
        IERC20ToERC7984Wrapper(cTokenIn).finalizeUnwrap(unwrapRequestId, decryptedAmountAndProof);
        _finalizedAmountIn[intentId] = amountInClear;
        _finalizedAmountReady[intentId] = true;
        emit UnwrapFinalized(intentId, cTokenIn, unwrapRequestId);
    }

    function refundConfidential(uint256 intentId) external {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        if (msg.sender != intent.user) revert UnauthorizedSettler();
        if (intent.status != ShadowIntentBook.IntentStatus.Settling) revert IntentNotReady();
        euint256 amount = lastPulledAmount[intentId];
        if (
            euint256.unwrap(amount) == bytes32(0) ||
            euint256.unwrap(unwrapRequestForIntent[intentId]) != bytes32(0) ||
            _finalizedAmountReady[intentId]
        ) revert RefundNotReady();

        lastPulledAmount[intentId] = euint256.wrap(bytes32(0));
        delete settlementStarted[intentId];
        IERC7984(intent.cTokenIn).confidentialTransfer(intent.user, amount);
        intentBook.markRefunded(intentId);
        emit IntentRefunded(intentId, intent.user, 0);
    }

    function refundFinalized(uint256 intentId) external {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        if (msg.sender != intent.user) revert UnauthorizedSettler();
        if (
            intent.status != ShadowIntentBook.IntentStatus.Settling ||
            !_finalizedAmountReady[intentId]
        ) revert RefundNotReady();
        uint256 amount = _finalizedAmountIn[intentId];

        delete _finalizedAmountIn[intentId];
        delete _finalizedAmountReady[intentId];
        delete settlementStarted[intentId];
        IERC20(intent.tokenIn).forceApprove(intent.cTokenIn, amount);
        IERC20ToERC7984Wrapper(intent.cTokenIn).wrap(intent.user, amount);
        intentBook.markRefunded(intentId);
        emit IntentRefunded(intentId, intent.user, amount);
    }

    /**
     * @notice Rescue tokens (demo ops).
     */
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @notice Verify a publicDecrypt proof for an intent minOut handle on-chain.
     */
    function verifyMinOut(
        uint256 intentId,
        bytes calldata decryptionProof
    ) external view returns (uint256 minOutClear) {
        euint256 handle = intentBook.minOutHandle(intentId);
        minOutClear = Nox.publicDecrypt(handle, decryptionProof);
    }

    function _validateIntentAssets(ShadowIntentBook.Intent memory intent) private view {
        if (
            !intentBook.isAssetPair(intent.cTokenIn, intent.tokenIn) ||
            !intentBook.isAssetPair(intent.cTokenOut, intent.tokenOut)
        ) revert AssetPairMismatch();
    }
}
