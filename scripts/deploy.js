const hre = require("hardhat");

async function main() {
  // Get the signers (accounts)
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy StBTC.sol
  const StBTC = await hre.ethers.getContractFactory("StBTC");
  const stBTC = await StBTC.deploy();
  await stBTC.deployed();
  console.log("StBTC token deployed to:", stBTC.address);

  // Deploy Vault.sol, passing the StBTC token address to its constructor
  const Vault = await hre.ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(stBTC.address); // Pass stBTC.address here
  await vault.deployed();
  console.log("Vault contract deployed to:", vault.address);
  console.log("Vault admin is initially:", await vault.admin());

  // Transfer ownership of StBTC token to the Vault contract
  console.log(`Transferring ownership of StBTC (${stBTC.address}) to Vault (${vault.address})...`);
  const tx = await stBTC.transferOwnership(vault.address);
  await tx.wait(); // Wait for the transaction to be mined
  console.log("Ownership of StBTC transferred to Vault.");
  console.log("New owner of StBTC is:", await stBTC.owner());

  console.log("\nDeployment and setup complete!");
  console.log("----------------------------------------------------");
  console.log("StBTC Address:", stBTC.address);
  console.log("Vault Address:", vault.address);
  console.log("----------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });