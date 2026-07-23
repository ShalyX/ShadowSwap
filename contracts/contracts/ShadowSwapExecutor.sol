// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    Nox,
    euint256,
    externalEuint256
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
 * - Batch netting (same pair) collapses multiple intents into fewer pool touches.
 * - Encrypted minOut prevents front-running the limit until execution.
 * - Auditor ACL works pre-execution without world-public amounts.
 *
 * ## Honesty
 * Uniswap (and any transparent AMM) requires plaintext amounts at swap time.
 * ShadowSwap does not claim permanent size secrecy after settlement — it claims
 * **pre-trade privacy + batch obfuscation + private balances after re-shield**.
 */
contract ShadowSwapExecutor {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct SoloExecutionParams {
        uint256 intentId;
        /// @dev publicDecrypt proof for the amount burned during unwrap
        bytes unwrapAmountProof;
        euint256 unwrapRequestId;
        /// @dev plaintext amountIn after public decrypt (must match proof validation path)
        uint256 amountInClear;
        /// @dev plaintext minOut after public decrypt
        uint256 minOutClear;
        bytes minOutDecryptProof;
    }

    // ============ Storage ============

    address public owner;
    ShadowIntentBook public intentBook;
    ISwapAdapter public swapAdapter;
    /// @notice Last amount handle pulled for an intent (event-parse fallback).
    mapping(uint256 => euint256) public lastPulledAmount;

    // ============ Events ============

    event SwapAdapterUpdated(address indexed adapter);
    event IntentBookUpdated(address indexed book);
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

    // ============ Errors ============

    error NotOwner();
    error ZeroAddress();
    error IntentNotReady();
    error IntentExpired();
    error BadMinOut();
    error TransferFailed();
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address intentBook_, address swapAdapter_) {
        owner = msg.sender;
        intentBook = ShadowIntentBook(intentBook_);
        swapAdapter = ISwapAdapter(swapAdapter_);
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
     *  - publicDecrypt minOut handle (or user supplies clear minOut they accept)
     *
     * For hackathon reliability, this function accepts clear amountIn/minOut that
     * were obtained via Nox publicDecrypt off-chain, and performs the public AMM leg.
     * The confidential pull+unwrap steps are exposed as separate helpers so the UI
     * can orchestrate multi-tx Nox flows.
     */
    function executeSoloAfterUnwrap(
        uint256 intentId,
        address user,
        address cTokenOut,
        address tokenIn,
        address tokenOut,
        uint256 amountInClear,
        uint256 minOutClear,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        ShadowIntentBook.Intent memory intent = intentBook.getIntent(intentId);
        if (intent.user != user) revert IntentNotReady();
        if (
            intent.status != ShadowIntentBook.IntentStatus.Pending &&
            intent.status != ShadowIntentBook.IntentStatus.Batched
        ) revert IntentNotReady();
        if (block.timestamp > intent.deadline) revert IntentExpired();
        if (amountInClear == 0) revert BadMinOut();

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
        address[] calldata users,
        address cTokenOut,
        address tokenIn,
        address tokenOut,
        uint256[] calldata amountIns,
        uint256[] calldata minOuts,
        uint256 deadline
    ) external returns (uint256 netOut) {
        uint256 n = intentIds.length;
        if (
            users.length != n ||
            amountIns.length != n ||
            minOuts.length != n
        ) revert LengthMismatch();
        if (n == 0) revert IntentNotReady();

        uint256 netIn;
        uint256 maxMinOut; // conservative: require out >= sum(minOuts)
        for (uint256 i = 0; i < n; i++) {
            netIn += amountIns[i];
            maxMinOut += minOuts[i];
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
            distributed += share;
            IERC20(tokenOut).forceApprove(cTokenOut, share);
            IERC20ToERC7984Wrapper(cTokenOut).wrap(users[i], share);
        }

        intentBook.markExecuted(intentIds, batchId);
        emit BatchSwapExecuted(batchId, tokenIn, tokenOut, netIn, netOut, n);
    }

    /**
     * @notice Helper: pull confidential funds from user as operator into this contract.
     * @dev Requires user setOperator(this, until) on cTokenIn.
     *      Encrypt amount for `cTokenIn` as applicationContract (fromExternal msg.sender = cToken).
     */
    function pullConfidential(
        address cTokenIn,
        address from,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint256 transferred) {
        transferred = IERC7984(cTokenIn).confidentialTransferFrom(
            from,
            address(this),
            encryptedAmount,
            inputProof
        );
        Nox.allowThis(transferred);
        emit ConfidentialPulled(0, from, cTokenIn, transferred);
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
        if (
            intent.status != ShadowIntentBook.IntentStatus.Pending &&
            intent.status != ShadowIntentBook.IntentStatus.Batched
        ) revert IntentNotReady();
        if (block.timestamp > intent.deadline) revert IntentExpired();

        // Grant executor + cToken ACL on intent handles for settlement
        intentBook.allowExecutorOnIntent(intentId);

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
     * @notice Helper: start unwrap of confidential balance held by this contract.
     * @dev Encrypt amount for `cTokenIn` as applicationContract.
     */
    function startUnwrap(
        address cTokenIn,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint256 unwrapRequestId) {
        unwrapRequestId = IERC20ToERC7984Wrapper(cTokenIn).unwrap(
            address(this),
            address(this),
            encryptedAmount,
            inputProof
        );
        emit UnwrapStarted(0, cTokenIn, unwrapRequestId);
    }

    /**
     * @notice Start unwrap using an on-chain handle already allowed to this contract
     *         (e.g. the handle returned by {pullFromIntent} / {pullConfidential}).
     */
    function startUnwrapHeld(
        uint256 intentId,
        address cTokenIn,
        euint256 amount
    ) external returns (euint256 unwrapRequestId) {
        unwrapRequestId = IERC20ToERC7984Wrapper(cTokenIn).unwrap(
            address(this),
            address(this),
            amount
        );
        emit UnwrapStarted(intentId, cTokenIn, unwrapRequestId);
    }

    /**
     * @notice Helper: finalize unwrap with Nox publicDecrypt proof → ERC-20 lands here.
     * @dev Off-chain: `handleClient.publicDecrypt(unwrapRequestId)` → pass `decryptionProof`.
     */
    function finalizeUnwrap(
        address cTokenIn,
        euint256 unwrapRequestId,
        bytes calldata decryptedAmountAndProof
    ) external {
        IERC20ToERC7984Wrapper(cTokenIn).finalizeUnwrap(unwrapRequestId, decryptedAmountAndProof);
        emit UnwrapFinalized(0, cTokenIn, unwrapRequestId);
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
        IERC20ToERC7984Wrapper(cTokenIn).finalizeUnwrap(unwrapRequestId, decryptedAmountAndProof);
        emit UnwrapFinalized(intentId, cTokenIn, unwrapRequestId);
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
}
