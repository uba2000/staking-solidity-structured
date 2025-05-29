// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  // Get the signers (accounts)
  const [deployer, anotherAccount] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  // console.log("Account balance:", (await deployer.getBalance()).toString());

  const treasuryAddress = anotherAccount.address;
  console.log("Treasury account selected:", treasuryAddress);


  // 1. Deploy StBTC.sol
  const StBTCFactory = await hre.ethers.getContractFactory("StBTC"); // Renamed for clarity
  const stBTC = await StBTCFactory.deploy();
  // await stBTC.deployed(); // REMOVE THIS LINE (ethers v6 change)
  const stBTCAddress = await stBTC.getAddress(); // Get address after deployment promise resolves
  console.log("StBTC token deployed to:", stBTCAddress);

  // 2. Deploy Vault.sol, passing the StBTC token address and treasury address
  const VaultFactory = await hre.ethers.getContractFactory("Vault"); // Renamed for clarity
  const vault = await VaultFactory.deploy(stBTCAddress, treasuryAddress);
  // await vault.deployed(); // REMOVE THIS LINE (ethers v6 change)
  const vaultAddress = await vault.getAddress(); // Get address
  console.log("Vault contract deployed to:", vaultAddress);
  console.log("Vault admin is initially:", await vault.admin());
  console.log("Vault treasury is set to:", await vault.treasury());


  // 3. Transfer ownership of StBTC token to the Vault contract
  console.log(`Transferring ownership of StBTC (${stBTCAddress}) to Vault (${vaultAddress})...`);
  const tx = await stBTC.transferOwnership(vaultAddress);
  await tx.wait(); // Wait for the transaction to be mined
  console.log("Ownership of StBTC transferred to Vault.");
  console.log("New owner of StBTC is:", await stBTC.owner());

  console.log("\nDeployment and setup complete!");
  console.log("----------------------------------------------------");
  console.log("StBTC Address:", stBTCAddress);
  console.log("Vault Address:", vaultAddress);
  console.log("Treasury Address used:", treasuryAddress);
  console.log("----------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });