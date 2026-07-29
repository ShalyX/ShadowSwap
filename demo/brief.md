# ShadowSwap Demo Brief

## Product
- Name: ShadowSwap
- URL: https://shadowswap-app.vercel.app
- Environment: live Ethereum Sepolia testnet
- Authentication method: public walkthrough; no wallet secrets recorded

## Audience
- Primary viewer: iExec WTF Hackathon judges
- Current problem: public AMM intents expose size and slippage before execution
- Desired next action: inspect the live app, contracts, and transaction evidence

## Promise
- One-sentence value proposition: ShadowSwap encrypts intent parameters with iExec Nox, batches same-pair flow into one public AMM touch, then re-shields each output.
- Main result: a verified two-intent Sepolia batch that swapped 12 sUSD once and minted two confidential cSETH outputs.

## Workflow
1. Establish the privacy boundary on the live landing page.
2. Show the encrypted intent interface and pre-trade controls.
3. Show the successful Sepolia batch receipt and confidential output splits.

## Format
- Target duration: 75–100 seconds
- Aspect ratio: 16:9
- Resolution: 1440×900
- Narration: yes
- Captions: yes
- Generated scenes allowed: no

## Safety
- Test data: 5 and 7 sUSD intents from the project test wallet
- Sensitive selectors: none; no wallet connection or secret entry
- Destructive actions excluded: all wallet and contract writes during recording

## Acceptance Criteria
- [x] Shows the product workflow
- [x] Shows a real on-chain result
- [x] No secrets or personal data
- [x] Claims match the visible evidence
- [x] Final CTA returns to the live app
