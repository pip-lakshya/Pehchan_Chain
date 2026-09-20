require("dotenv").config();

const { Wallet, JsonRpcProvider, formatEther } = require("ethers");

async function main() {
    const provider = new JsonRpcProvider(
        process.env.BLOCKCHAIN_RPC_URL
    );

    const wallet = new Wallet(
        process.env.BLOCKCHAIN_PRIVATE_KEY,
        provider
    );

    const network = await provider.getNetwork();
    const balance = await provider.getBalance(wallet.address);

    console.log("\n========== BLOCKCHAIN CHECK ==========");
    console.log("Wallet Address :", wallet.address);
    console.log("Chain ID       :", network.chainId.toString());
    console.log("Balance        :", formatEther(balance), "POL");
    console.log("======================================\n");
}

main().catch((error) => {
    console.error("\n❌ ERROR:", error.message);
    process.exit(1);
});
