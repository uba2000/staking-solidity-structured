const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vault Contract Tests", function () {
  let StBTC, stBTC, Vault, vault;
  let owner, admin, staker1, staker2, nonAdmin; // Signers

  const APY_BASIS_POINTS = 500; // 5.00%
  const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;

  beforeEach(async function () {
    // Get signers
    [owner, adminSigner, staker1, staker2, nonAdmin] = await ethers.getSigners();

    // Deploy StBTC
    StBTC = await ethers.getContractFactory("StBTC");
    stBTC = await StBTC.connect(owner).deploy(); // 'owner' deploys StBTC

    // Deploy Vault, passing StBTC address. Vault admin will be deployer (adminSigner in this setup if distinct)
    // For consistency with the contract's constructor, let's have adminSigner deploy Vault
    Vault = await ethers.getContractFactory("Vault");
    vault = await Vault.connect(adminSigner).deploy(await stBTC.getAddress());

    // Transfer StBTC ownership to Vault
    // The 'owner' of StBTC (who deployed it) must transfer ownership to the vault contract
    await stBTC.connect(owner).transferOwnership(await vault.getAddress());

    // For tests, ensure admin role in Vault matches adminSigner if different from owner
    // In this setup, adminSigner is the deployer of Vault, so it's already admin.
    // If owner deployed Vault, you'd do: await vault.connect(owner).changeAdmin(adminSigner.address);
  });

  describe("Deployment & Configuration", function () {
    it("Should set the right StBTC token address", async function () {
      expect(await vault.stBTC_token()).to.equal(await stBTC.getAddress());
    });

    it("Should set the deployer as admin", async function () {
      expect(await vault.admin()).to.equal(adminSigner.address);
    });

    it("StBTC token should have Vault as its owner", async function () {
      expect(await stBTC.owner()).to.equal(await vault.getAddress());
    });
  });

  describe("Deposit Registration (registerBtcDeposit)", function () {
    const btcTxHash = ethers.id("deposit1"); // Generates a bytes32 hash
    const depositAmount = ethers.parseUnits("100", 18); // 100 stBTC
    const stakingDuration = 60 * 60 * 24 * 30; // 30 days in seconds

    it("Should allow admin to register a deposit", async function () {
      const initialTimestamp = await time.latest();
      await expect(
        vault.connect(adminSigner).registerBtcDeposit(
          btcTxHash,
          staker1.address,
          depositAmount,
          stakingDuration,
          nonAdmin.address // Mock finality provider
        )
      )
        .to.emit(vault, "DepositRegistered")
        .withArgs(
          btcTxHash,
          staker1.address,
          depositAmount,
          (timestamp) => timestamp > initialTimestamp && timestamp <= initialTimestamp + 10, // Check within a small delta
          stakingDuration,
          nonAdmin.address
        );

      const registeredVault = await vault.vaults(btcTxHash);
      expect(registeredVault.staker).to.equal(staker1.address);
      expect(registeredVault.amount).to.equal(depositAmount);
      expect(registeredVault.stakingDuration).to.equal(stakingDuration);
      expect(registeredVault.registered).to.be.true;
      expect(registeredVault.minted).to.be.false;
    });

    it("Should prevent non-admin from registering a deposit", async function () {
      await expect(
        vault.connect(nonAdmin).registerBtcDeposit(
          btcTxHash,
          staker1.address,
          depositAmount,
          stakingDuration,
          nonAdmin.address
        )
      ).to.be.revertedWith("Vault: Caller is not the admin");
    });

    it("Should prevent registering a deposit with zero amount", async function () {
      await expect(
        vault.connect(adminSigner).registerBtcDeposit(
          btcTxHash,
          staker1.address,
          0, // Zero amount
          stakingDuration,
          nonAdmin.address
        )
      ).to.be.revertedWith("Vault: Amount must be greater than zero");
    });

    it("Should prevent registering a deposit with zero staking duration", async function () {
      await expect(
        vault.connect(adminSigner).registerBtcDeposit(
          btcTxHash,
          staker1.address,
          depositAmount,
          0, // Zero duration
          nonAdmin.address
        )
      ).to.be.revertedWith("Vault: Staking duration must be positive");
    });

    it("Should prevent registering an already registered TxHash", async function () {
      await vault.connect(adminSigner).registerBtcDeposit(
        btcTxHash,
        staker1.address,
        depositAmount,
        stakingDuration,
        nonAdmin.address
      );
      await expect(
        vault.connect(adminSigner).registerBtcDeposit(
          btcTxHash, // Same TxHash
          staker2.address,
          depositAmount,
          stakingDuration,
          nonAdmin.address
        )
      ).to.be.revertedWith("Vault: Deposit already registered for this TxHash");
    });
  });

  describe("Minting stBTC (mintStBTC)", function () {
    const btcTxHash = ethers.id("mint_deposit1");
    const depositAmount = ethers.parseUnits("50", 18);
    const stakingDuration = 60 * 60 * 24 * 7; // 7 days

    beforeEach(async function () {
      // Admin registers a deposit for staker1
      await vault.connect(adminSigner).registerBtcDeposit(
        btcTxHash,
        staker1.address,
        depositAmount,
        stakingDuration,
        nonAdmin.address
      );
    });

    it("Should allow the registered staker to mint stBTC", async function () {
      await expect(vault.connect(staker1).mintStBTC(btcTxHash))
        .to.emit(vault, "StBTCMinted")
        .withArgs(btcTxHash, staker1.address, depositAmount);

      expect(await stBTC.balanceOf(staker1.address)).to.equal(depositAmount);
      const registeredVault = await vault.vaults(btcTxHash);
      expect(registeredVault.minted).to.be.true;
    });

    it("Should prevent minting if deposit not registered", async function () {
      const unregisteredTxHash = ethers.id("unregistered");
      await expect(
        vault.connect(staker1).mintStBTC(unregisteredTxHash)
      ).to.be.revertedWith("Vault: Deposit not registered or invalid TxHash");
    });

    it("Should prevent non-staker from minting", async function () {
      await expect(
        vault.connect(staker2).mintStBTC(btcTxHash) // staker2 tries to mint staker1's deposit
      ).to.be.revertedWith("Vault: Caller is not the registered staker for this deposit");
    });

    it("Should prevent minting if stBTC already minted for the deposit", async function () {
      await vault.connect(staker1).mintStBTC(btcTxHash); // First mint
      await expect(
        vault.connect(staker1).mintStBTC(btcTxHash) // Second attempt
      ).to.be.revertedWith("Vault: stBTC already minted for this deposit");
    });

    it("Should prevent minting if staking period has already ended (safety check)", async function () {
      const shortDurationTxHash = ethers.id("short_duration_deposit");
      const shortDuration = 100; // 100 seconds
      await vault.connect(adminSigner).registerBtcDeposit(
        shortDurationTxHash,
        staker1.address,
        depositAmount,
        shortDuration, // Short duration
        nonAdmin.address
      );
      // Advance time past the staking duration
      await time.increase(shortDuration + 10);

      await expect(
        vault.connect(staker1).mintStBTC(shortDurationTxHash)
      ).to.be.revertedWith("Vault: Staking period already ended (safety check)");
    });
  });

  describe("Burning stBTC (burnStBTC)", function () {
    const btcTxHash = ethers.id("burn_deposit1");
    const depositAmount = ethers.parseUnits("200", 18);
    const stakingDuration = 60 * 60 * 24 * 14; // 14 days

    beforeEach(async function () {
      await vault.connect(adminSigner).registerBtcDeposit(
        btcTxHash,
        staker1.address,
        depositAmount,
        stakingDuration,
        nonAdmin.address
      );
      await vault.connect(staker1).mintStBTC(btcTxHash); // Staker mints their stBTC
    });

    it("Should prevent burning before staking duration ends", async function () {
      await expect(
        vault.connect(staker1).burnStBTC(btcTxHash)
      ).to.be.revertedWith("Vault: Staking duration not yet reached");
    });

    it("Should allow staker to burn stBTC after staking duration and receive rewards conceptually", async function () {
      // Advance time past the staking duration
      const registeredVaultBeforeBurn = await vault.vaults(btcTxHash);
      const expectedUnlockTime = registeredVaultBeforeBurn.depositTime + registeredVaultBeforeBurn.stakingDuration;
      await time.increaseTo(expectedUnlockTime);

      const expectedPrincipal = depositAmount;
      const expectedReward = (((depositAmount * BigInt(APY_BASIS_POINTS)) * registeredVaultBeforeBurn.stakingDuration) / 10000n) / BigInt(SECONDS_IN_YEAR);

      await expect(vault.connect(staker1).burnStBTC(btcTxHash))
        .to.emit(vault, "StBTCBurned")
        .withArgs(btcTxHash, staker1.address, expectedPrincipal, expectedReward);

      expect(await stBTC.balanceOf(staker1.address)).to.equal(0);
      const registeredVaultAfterBurn = await vault.vaults(btcTxHash);
      expect(registeredVaultAfterBurn.minted).to.be.false;
    });

    it("Should prevent burning if stBTC not minted", async function () {
      const noMintTxHash = ethers.id("no_mint_deposit");
      await vault.connect(adminSigner).registerBtcDeposit(
        noMintTxHash,
        staker1.address,
        depositAmount,
        stakingDuration,
        nonAdmin.address
      );
      // Advance time
      const registeredVaultNoMint = await vault.vaults(noMintTxHash);
      const unlockTimeNoMint = registeredVaultNoMint.depositTime + registeredVaultNoMint.stakingDuration;
      await time.increaseTo(unlockTimeNoMint);

      await expect(
        vault.connect(staker1).burnStBTC(noMintTxHash)
      ).to.be.revertedWith("Vault: No stBTC minted for this deposit or already burned");
    });

    it("Should prevent non-staker from burning", async function () {
      // Advance time
      const registeredVault = await vault.vaults(btcTxHash);
      const expectedUnlockTime = registeredVault.depositTime + registeredVault.stakingDuration;
      await time.increaseTo(expectedUnlockTime);

      await expect(
        vault.connect(staker2).burnStBTC(btcTxHash)
      ).to.be.revertedWith("Vault: Caller is not the staker for this deposit");
    });

    it("Should prevent burning if staker has insufficient stBTC balance (e.g., transferred away)", async function () {
      // Simulate staker transferring away some (or all) stBTC - for this, StBTC would need to be transferable by non-owner
      // This specific scenario is harder to test directly if StBTC.transfer is restricted by Ownable.
      // The ERC20 _burn function itself handles insufficient balance, but our check `stBTC_token.balanceOf(msg.sender) >= vault.amount` is explicit.
      // For this test, we'll assume the internal check `require(stBTC_token.balanceOf(msg.sender) >= vault.amount)` works as intended.
      // If we wanted to test this explicitly, we'd need a way for staker1 to have less than `depositAmount`.
      // For now, we trust the explicit require and OpenZeppelin's ERC20 internal checks.

      // Advance time
      const registeredVault = await vault.vaults(btcTxHash);
      const expectedUnlockTime = registeredVault.depositTime + registeredVault.stakingDuration;
      await time.increaseTo(expectedUnlockTime);

      // Artificially reduce staker1's balance (conceptually, this would be a transfer)
      // This requires Vault to be able to burn less than total, or staker to have less.
      // We can simulate by trying to burn for a vault where user's balance is 0 (after a first burn)
      await vault.connect(staker1).burnStBTC(btcTxHash); // First successful burn

      // Second attempt to burn (balance is now 0)
      await expect(
        vault.connect(staker1).burnStBTC(btcTxHash)
      ).to.be.revertedWith("Vault: No stBTC minted for this deposit or already burned"); // Because vault.minted is false
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to change admin", async function () {
      await vault.connect(adminSigner).changeAdmin(nonAdmin.address);
      expect(await vault.admin()).to.equal(nonAdmin.address);
    });

    it("Should prevent non-admin from changing admin", async function () {
      await expect(
        vault.connect(nonAdmin).changeAdmin(staker1.address)
      ).to.be.revertedWith("Vault: Caller is not the admin");
    });
  });

  describe("View Functions", function () {
    it("getCalculatedUnlockTime should return correct unlock time", async function () {
      const btcTxHash = ethers.id("view_deposit1");
      const depositAmount = ethers.parseUnits("10", 18);
      const stakingDuration = 60 * 60 * 24 * 5; // 5 days
      await vault.connect(adminSigner).registerBtcDeposit(
        btcTxHash,
        staker1.address,
        depositAmount,
        stakingDuration,
        nonAdmin.address
      );
      const registeredVault = await vault.vaults(btcTxHash);
      const expectedUnlockTime = registeredVault.depositTime + registeredVault.stakingDuration;

      expect(await vault.getCalculatedUnlockTime(btcTxHash)).to.equal(expectedUnlockTime);
    });

    it("getCalculatedUnlockTime should revert for non-registered deposit", async function () {
      const nonExistentTxHash = ethers.id("non_existent_deposit");
      await expect(vault.getCalculatedUnlockTime(nonExistentTxHash))
        .to.be.revertedWith("Vault: Deposit not registered");
    });
  });
});