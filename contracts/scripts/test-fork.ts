import hre from "hardhat";

async function main() {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        },
      },
    ],
  });

  const intentBook = "0x985f2d9fa7fbf356b22abe0dffd69b315bfc6220";
  const executor = "0xe281efeaa405fbbcad7082282a3f76ffab47b2b4";
  const cTokenIn = "0xF602925adc32F54B83596774C96d4EA7Bf73D92B";
  const amountIn = "0x0000aa36a723016b824c988b8aa2f49cab321ca0026269e69a18eb2403d62693";
  const noxCompute = "0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF";

  const [signer] = await hre.ethers.getSigners();
  
  // Impersonate executor
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [executor],
  });
  await signer.sendTransaction({
    to: executor,
    value: hre.ethers.parseEther("1.0"),
  });
  const executorSigner = await hre.ethers.getSigner(executor);

  const BookABI = [
    "function allowExecutorOnIntent(uint256 intentId) external",
    "function getIntent(uint256) external view returns (tuple(address user, address cTokenIn, address cTokenOut, address tokenIn, address tokenOut, bytes32 amountIn, bytes32 minAmountOut, uint64 deadline, uint8 status))"
  ];
  const NoxComputeABI = [
    "function isAllowed(bytes32 handle, address account) external view returns (bool)"
  ];
  
  const book = new hre.ethers.Contract(intentBook, BookABI, executorSigner);
  const nox = new hre.ethers.Contract(noxCompute, NoxComputeABI, executorSigner);

  console.log("Before allowExecutorOnIntent:");
  console.log("  isAllowed(amountIn, cTokenIn):", await nox.isAllowed(amountIn, cTokenIn));

  await book.allowExecutorOnIntent(8);
  
  console.log("After allowExecutorOnIntent:");
  console.log("  isAllowed(amountIn, cTokenIn):", await nox.isAllowed(amountIn, cTokenIn));
  
  // Try to pull
  const ExecutorABI = [
    "function pullFromIntent(uint256 intentId) external returns (bytes32)"
  ];
  const execContract = new hre.ethers.Contract(executor, ExecutorABI, executorSigner);
  
  try {
    await execContract.pullFromIntent(8);
    console.log("pullFromIntent succeeded!");
  } catch (err: any) {
    console.error("pullFromIntent failed:", err.message);
  }
}

main().catch(console.error);
