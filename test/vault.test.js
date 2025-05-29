// test/vault.test.js (for NEW Vault.sol with StakeInfo)
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("New Vault Contract Tests (Task 2 - Time-Locked Staking)", function () {
  let StBTC, stBTC, Vault, vault;
  let owner, adminDeployer, treasury, staker1, staker2, otherUser;

  const APY_BASIS_POINTS = 500n; // 5.00% (use BigInt suffix 'n')
  const SECONDS_IN_YEAR = 365n * 24n * 60n * 60n; // Use BigInt
  const PROTOCOL_FEE_BASIS_POINTS = 100n; // 1% (use BigInt suffix 'n')
  const ONE_HUNDRED_PERCENT_BASIS_POINTS = 10000n; // For calculations

  beforeEach(async function () {
    [owner, adminDeployer, treasury, staker1, staker2, otherUser] = await ethers.getSigners();

    // Deploy StBTC
    const StBTCFactory = await ethers.getContractFactory("StBTC");
    stBTC = await StBTCFactory.connect(owner).deploy();

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("Vault");
    vault = await VaultFactory.connect(adminDeployer).deploy(
      await stBTC.getAddress(),
      await treasury.getAddress()
    );

    // Transfer StBTC ownership to Vault
    await stBTC.connect(owner).transferOwnership(await vault.getAddress());
  });

  describe("Deployment & Configuration", function () {
    it("Should set the correct StBTC token address", async function () {
      expect(await vault.stBTC_token()).to.equal(await stBTC.getAddress());
    });

    it("Should set the deployer as admin", async function () {
      expect(await vault.admin()).to.equal(await adminDeployer.getAddress());
    });

    it("Should set the correct treasury address", async function () {
      expect(await vault.treasury()).to.equal(await treasury.getAddress());
    });

    it("StBTC token should have Vault as its owner", async function () {
      expect(await stBTC.owner()).to.equal(await vault.getAddress());
    });
  });

  describe("depositAndStake", function () {
    const depositAmount = ethers.parseUnits("100", 18); // 100 stBTC
    const lockDuration = 7n * 24n * 60n * 60n; // 7 days in seconds (BigInt)

    it("Should allow a user to deposit and stake BTC (mint stBTC principal)", async function () {
      const initialStakerBalance = await stBTC.balanceOf(staker1.address);
      const tx = await vault.connect(staker1).depositAndStake(staker1.address, depositAmount, lockDuration);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedStartTimestamp = BigInt(block.timestamp);

      await expect(tx)
        .to.emit(vault, "DepositRegistered")
        .withArgs(staker1.address, depositAmount);

      await expect(tx)
        .to.emit(vault, "LockStarted")
        .withArgs(staker1.address, depositAmount, lockDuration);

      // Check stBTC balance of staker
      expect(await stBTC.balanceOf(staker1.address)).to.equal(initialStakerBalance + depositAmount);

      // Check StakeInfo
      const stakeInfo = await vault.userStakes(staker1.address);
      expect(stakeInfo.principalAmount).to.equal(depositAmount);
      expect(stakeInfo.startTimestamp).to.equal(expectedStartTimestamp);
      expect(stakeInfo.lockDuration).to.equal(lockDuration);
      expect(stakeInfo.hasWithdrawn).to.be.false;
      expect(stakeInfo.isActive).to.be.true;
    });

    it("Should prevent depositing if user already has an active stake", async function () {
      await vault.connect(staker1).depositAndStake(staker1.address, depositAmount, lockDuration);
      await expect(
        vault.connect(staker1).depositAndStake(staker1.address, depositAmount, lockDuration)
      ).to.be.revertedWith("Vault: User already has an active stake. Withdraw first.");
    });

    it("Should prevent depositing zero amount", async function () {
      await expect(
        vault.connect(staker1).depositAndStake(staker1.address, 0, lockDuration)
      ).to.be.revertedWith("Vault: Amount must be greater than zero");
    });

    it("Should prevent depositing with zero lock duration", async function () {
      await expect(
        vault.connect(staker1).depositAndStake(staker1.address, depositAmount, 0)
      ).to.be.revertedWith("Vault: Lock duration must be positive");
    });
  });

  describe("withdraw", function () {
    const principalAmount = ethers.parseUnits("1000", 18); // 1000 stBTC
    const lockDuration7Days = 7n * 24n * 60n * 60n; // 7 days
    const lockDuration30Days = 30n * 24n * 60n * 60n; // 30 days

    beforeEach(async function () {
      // Staker1 deposits
      await vault.connect(staker1).depositAndStake(staker1.address, principalAmount, lockDuration30Days);
    });

    it("Should prevent withdrawal before lock duration expires", async function () {
      await expect(vault.connect(staker1).withdraw()).to.be.revertedWith(
        "Vault: Lock duration not yet expired"
      );
    });

    it("Should allow withdrawal after lock duration, mint yield, burn principal, and update state", async function () {
      const stakeInfoBefore = await vault.userStakes(staker1.address);
      const timeToIncrease = stakeInfoBefore.lockDuration + 10n; // a bit after lock expires
      await time.increase(timeToIncrease);

      const stakerBalanceBeforeWithdraw = await stBTC.balanceOf(staker1.address);
      const treasuryBalanceBeforeWithdraw = await stBTC.balanceOf(treasury.address);

      // Calculate expected yield (using actual time passed for yield calculation up to withdrawal)
      // Time passed should be close to lockDuration if we increase exactly to it,
      // or slightly more if we increase beyond it.
      // The contract uses `block.timestamp - stake.startTimestamp`
      const currentTime = BigInt(await time.latest());
      const actualTimePassedForYield = currentTime - stakeInfoBefore.startTimestamp;

      const expectedGrossYield =
        (stakeInfoBefore.principalAmount * APY_BASIS_POINTS * actualTimePassedForYield) /
        (ONE_HUNDRED_PERCENT_BASIS_POINTS * SECONDS_IN_YEAR);
      const expectedFeeAmount = (expectedGrossYield * PROTOCOL_FEE_BASIS_POINTS) / ONE_HUNDRED_PERCENT_BASIS_POINTS;
      const expectedNetYield = expectedGrossYield - expectedFeeAmount;

      const tx = await vault.connect(staker1).withdraw();

      await expect(tx)
        .to.emit(vault, "YieldMinted")
        .withArgs(staker1.address, expectedNetYield, expectedFeeAmount);

      await expect(tx)
        .to.emit(vault, "PrincipalWithdrawn")
        .withArgs(staker1.address, stakeInfoBefore.principalAmount);

      // Staker balance: had principal, gained net yield, then principal burned
      expect(await stBTC.balanceOf(staker1.address)).to.equal(stakerBalanceBeforeWithdraw - stakeInfoBefore.principalAmount + expectedNetYield);

      // Treasury balance: gained fee amount
      expect(await stBTC.balanceOf(treasury.address)).to.equal(treasuryBalanceBeforeWithdraw + expectedFeeAmount);

      const stakeInfoAfter = await vault.userStakes(staker1.address);
      expect(stakeInfoAfter.hasWithdrawn).to.be.true;
      expect(stakeInfoAfter.isActive).to.be.false;
    });

    it("Should correctly calculate yield if withdrawal happens exactly at lock expiry", async function () {
      const stakeInfoBefore = await vault.userStakes(staker1.address);
      await time.increaseTo(stakeInfoBefore.startTimestamp + stakeInfoBefore.lockDuration);

      const expectedGrossYield =
        (stakeInfoBefore.principalAmount * APY_BASIS_POINTS * stakeInfoBefore.lockDuration) /
        (ONE_HUNDRED_PERCENT_BASIS_POINTS * SECONDS_IN_YEAR);
      const expectedFeeAmount = (expectedGrossYield * PROTOCOL_FEE_BASIS_POINTS) / ONE_HUNDRED_PERCENT_BASIS_POINTS;
      const expectedNetYield = expectedGrossYield - expectedFeeAmount;

      await expect(vault.connect(staker1).withdraw())
        .to.emit(vault, "YieldMinted")
        .withArgs(staker1.address, expectedNetYield, expectedFeeAmount);
    });


    it("Should prevent withdrawal if stake already withdrawn", async function () {
      await time.increase(lockDuration30Days + 1000n); // Ensure lock expired
      await vault.connect(staker1).withdraw(); // First withdrawal
      await expect(vault.connect(staker1).withdraw()).to.be.revertedWith(
        "Vault: Stake already withdrawn"
      );
    });

    it("Should prevent withdrawal if no active stake", async function () {
      // otherUser has no stake
      await expect(vault.connect(otherUser).withdraw()).to.be.revertedWith(
        "Vault: No active stake for user"
      );
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to change admin", async function () {
      await vault.connect(adminDeployer).changeAdmin(otherUser.address);
      expect(await vault.admin()).to.equal(otherUser.address);
    });

    it("Should prevent non-admin from changing admin", async function () {
      await expect(
        vault.connect(otherUser).changeAdmin(staker1.address)
      ).to.be.revertedWith("Vault: Caller is not the admin");
    });

    it("Should allow admin to change treasury", async function () {
      await vault.connect(adminDeployer).changeTreasury(otherUser.address);
      expect(await vault.treasury()).to.equal(otherUser.address);
    });

    it("Should prevent non-admin from changing treasury", async function () {
      await expect(
        vault.connect(otherUser).changeTreasury(staker1.address)
      ).to.be.revertedWith("Vault: Caller is not the admin");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseUnits("10", 18);
      const lockDuration = 7n * 24n * 60n * 60n; // 7 days
      await vault.connect(staker1).depositAndStake(staker1.address, depositAmount, lockDuration);
    });

    it("getStakeInfo should return correct stake details for an active stake", async function () {
      const stakeInfo = await vault.getStakeInfo(staker1.address);
      expect(stakeInfo.principalAmount).to.equal(ethers.parseUnits("10", 18));
      expect(stakeInfo.isActive).to.be.true;
      expect(stakeInfo.hasWithdrawn).to.be.false;
    });

    it("getCalculatedUnlockTime should return correct unlock time for an active stake", async function () {
      const stakeInfo = await vault.userStakes(staker1.address); // Get internal struct to access startTimestamp
      const expectedUnlockTime = stakeInfo.startTimestamp + stakeInfo.lockDuration;
      expect(await vault.getCalculatedUnlockTime(staker1.address)).to.equal(expectedUnlockTime);
    });

    it("getCalculatedUnlockTime should revert for user with no active stake", async function () {
      await expect(vault.getCalculatedUnlockTime(otherUser.address))
        .to.be.revertedWith("Vault: No active stake for user");
    });
  });
});