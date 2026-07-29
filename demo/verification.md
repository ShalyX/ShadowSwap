# ShadowSwap demo verification

## Final artifact
- File: `/root/ShadowSwap/demo/shadowswap-demo-final.mp4`
- Duration: 82.256 seconds
- Container: MP4
- Video: H.264, 1920×1080, 30 fps
- Audio: AAC, mono, 24 kHz
- Size: 5,121,720 bytes
- Deployment shown: archived v1 golden run. Current v4 proof is recorded separately in `evidence/golden-batch/v4/latest.json`.

## Workflow checks
- Live ShadowSwap landing page loaded.
- Live trade console loaded.
- Privacy and selective-disclosure boundary appeared.
- Live Sepolia Blockscout receipt loaded.
- Receipt visibly showed success, 12 sUSD into the AMM, 0.005718995683194033 sETH returned, and two confidential output mints.
- Final shot returned to the live app.

## Safety and claim checks
- No wallet was connected during recording.
- No private key, RPC credential, token, email, or personal notification appeared.
- Narration limits the claim to pre-trade privacy, batch obfuscation, selective auditor access, and private balances after settlement.
- Narration explicitly states that the public AMM leg remains visible.

## Automated verification
- `ffprobe`: valid H.264/AAC MP4 with nonzero duration.
- `blackdetect`: no black-frame interval detected.
- Recording action log: all eight steps succeeded.
- Multimodal video review: PASS. Visuals coherent, captions legible, narration intelligible, evidence ordered correctly, no secret exposure, and no unsupported claim detected.

## Known limitation
- The recording does not connect a browser wallet or repeat the on-chain writes. It shows the public app workflow and the independently verifiable archived v1 receipt. Use the README's v4 receipt and `evidence/golden-batch/v4/latest.json` for the current deployment.
