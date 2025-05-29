// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/// @title IStBTC Interface
/// @notice Defines the external functions for the StBTC token contract.
interface IStBTC {
    /// @notice Mints new StBTC tokens to a specified address.
    /// @param to The address to mint tokens to.
    /// @param amount The amount of tokens to mint.
    function mint(address to, uint256 amount) external;

    /// @notice Burns StBTC tokens from a specified account.
    /// @param account The account to burn tokens from.
    /// @param amount The amount of tokens to burn.
    function burnFrom(address account, uint256 amount) external;

    /// @notice Gets the StBTC token balance of an account.
    /// @param account The address to query the balance of.
    /// @return The token balance.
    function balanceOf(address account) external view returns (uint256);
}

/// @title Vault Contract for Time-Locked BTC Staking with Yield (Task 2)
/// @author Uba Noel
/// @notice This contract simulates a time-locked BTC staking vault where users deposit
/// (conceptually) BTC, receive stBTC, and earn yield in stBTC based on a fixed APY.
contract Vault {
    IStBTC public immutable stBTC_token; // Made immutable for slight gas saving
    address public admin;
    address public treasury; // For collecting protocol fees

    uint256 public constant APY_BASIS_POINTS = 500; // 5.00% APY
    uint256 public constant SECONDS_IN_YEAR = 365 days;
    uint256 public constant PROTOCOL_FEE_BASIS_POINTS = 100; // 1% fee on yield

    struct StakeInfo {
        uint256 principalAmount; // Amount of BTC (represented by stBTC) initially staked
        uint256 startTimestamp;  // Timestamp when the lock period started
        uint256 lockDuration;    // Duration of the lock in seconds
        bool hasWithdrawn;       // Flag to prevent re-withdrawal from the same completed stake
        bool isActive;           // Flag to indicate if there's an active stake for the user
    }

    mapping(address => StakeInfo) public userStakes;

    // --- Events ---
    /// @notice Emitted when a user's (conceptual) BTC deposit is registered and stBTC principal is minted.
    /// @param user The address of the staker.
    /// @param amount The principal amount of BTC staked (and stBTC minted).
    event DepositRegistered(address indexed user, uint256 amount);

    /// @notice Emitted when a user's stake lock period officially starts.
    /// @param user The address of the staker.
    /// @param amount The principal amount locked.
    /// @param duration The duration of the lock in seconds.
    event LockStarted(address indexed user, uint256 amount, uint256 duration);

    /// @notice Emitted when yield (as stBTC) is minted to a user upon withdrawal.
    /// @param user The address of the staker.
    /// @param netYieldAmount The amount of stBTC minted as net yield (after protocol fee).
    /// @param feeAmount The amount of stBTC minted as protocol fee.
    event YieldMinted(address indexed user, uint256 netYieldAmount, uint256 feeAmount);

    /// @notice Emitted when a user's principal stBTC is burned upon withdrawal.
    /// @param user The address of the staker.
    /// @param amount The principal amount of stBTC burned.
    event PrincipalWithdrawn(address indexed user, uint256 amount); // Renamed for clarity

    modifier onlyAdmin() {
        require(msg.sender == admin, "Vault: Caller is not the admin");
        _;
    }

    /// @notice Ensures the caller has an active stake.
    modifier hasActiveStake() {
        require(userStakes[msg.sender].isActive, "Vault: No active stake for user");
        _;
    }

    constructor(address _stBTCTokenAddress, address _treasuryAddress) {
        require(_stBTCTokenAddress != address(0), "Vault: Invalid stBTC token address");
        require(_treasuryAddress != address(0), "Vault: Invalid treasury address");
        stBTC_token = IStBTC(_stBTCTokenAddress);
        admin = msg.sender; // Deployer is initial admin
        treasury = _treasuryAddress;
    }

    /// @notice Allows a user (or admin on behalf of user for simulation) to deposit (conceptual) BTC
    /// and start a staking lock period. Mints principal stBTC to the user.
    /// @dev For this simulation, only one active stake per user is allowed.
    /// @param staker The address of the user staking.
    /// @param amount The amount of BTC to stake.
    /// @param lockDuration The duration in seconds for the stake lock.
    function depositAndStake(address staker, uint256 amount, uint256 lockDuration) external {
        // In a real scenario, this might be `payable` and receive actual ETH/BTC collateral,
        // or an admin might call it after off-chain BTC confirmation.
        // For this task's evolution, let's assume this function is called to initiate the stake.
        // We can keep it admin-only if the "oracle confirms deposit" idea is still strong,
        // or open it up if users are "depositing" directly into this EVM vault.
        // Let's make it callable by anyone for now to simulate direct user interaction with THIS vault.
        // If it needs to be admin-only to represent Babylon deposit, add `onlyAdmin`.

        require(staker != address(0), "Vault: Invalid staker address");
        require(amount > 0, "Vault: Amount must be greater than zero");
        require(lockDuration > 0, "Vault: Lock duration must be positive");
        require(!userStakes[staker].isActive, "Vault: User already has an active stake. Withdraw first.");

        userStakes[staker] = StakeInfo({
            principalAmount: amount,
            startTimestamp: block.timestamp,
            lockDuration: lockDuration,
            hasWithdrawn: false,
            isActive: true
        });

        // Mint principal stBTC to the staker
        stBTC_token.mint(staker, amount);

        emit DepositRegistered(staker, amount);
        emit LockStarted(staker, amount, lockDuration);
    }

    /// @notice Allows a staker to withdraw their principal and accrued yield (as stBTC)
    /// after their lock duration has expired.
    function withdraw() external hasActiveStake {
        StakeInfo storage stake = userStakes[msg.sender]; // msg.sender is the staker

        require(!stake.hasWithdrawn, "Vault: Stake already withdrawn");
        uint256 unlockTime = stake.startTimestamp + stake.lockDuration;
        require(block.timestamp >= unlockTime, "Vault: Lock duration not yet expired");

        // Calculate time passed for yield calculation
        // Ensure timePassed is not negative if block.timestamp somehow preceded startTimestamp (should not happen)
        uint256 timePassed = block.timestamp - stake.startTimestamp;
        if (timePassed > stake.lockDuration) { // Cap yield accrual to the lock duration
            timePassed = stake.lockDuration;
        }
        // Or, allow yield to accrue even past lock duration if user withdraws late?
        // For this task, let's assume yield accrues up to the point of withdrawal if it's after lockDuration.
        // So, use: timePassed = block.timestamp - stake.startTimestamp; (without capping to lockDuration explicitly here)


        // 1. Calculate Gross Yield
        uint256 grossYieldAmount = (stake.principalAmount * APY_BASIS_POINTS * timePassed) / (10000 * SECONDS_IN_YEAR);

        // 2. Calculate Protocol Fee from Gross Yield
        uint256 feeAmount = (grossYieldAmount * PROTOCOL_FEE_BASIS_POINTS) / 10000;

        // 3. Calculate Net Yield for User
        uint256 netYieldToUser = grossYieldAmount - feeAmount;

        // 4. Mint Net Yield to User and Fee to Treasury
        if (netYieldToUser > 0) {
            stBTC_token.mint(msg.sender, netYieldToUser);
        }
        if (feeAmount > 0) {
            stBTC_token.mint(treasury, feeAmount);
        }
        emit YieldMinted(msg.sender, netYieldToUser, feeAmount);

        // 5. Burn Principal stBTC from User
        // User must have their principal stBTC to burn it.
        require(stBTC_token.balanceOf(msg.sender) >= stake.principalAmount + netYieldToUser, "Vault: Insufficient stBTC balance for withdrawal (principal + earned net yield)");
        // The above check might be too strict if user transferred some stBTC.
        // More accurate: ensure they have at least principal to burn.
        // The yield was just minted, so it's added to their balance.
        // The question is, should they be able to withdraw if they transferred away their principal stBTC?
        // Standard staking: yes, the record of their stake matters. The stBTC is just a representation.
        // For burning, they must have the tokens.
        // Let's assume they need to present the principal stBTC for burning.
        stBTC_token.burnFrom(msg.sender, stake.principalAmount);
        emit PrincipalWithdrawn(msg.sender, stake.principalAmount);

        // 6. Update Stake Info
        stake.hasWithdrawn = true;
        stake.isActive = false; // Mark stake as no longer active
        // To allow re-staking, we could delete userStakes[msg.sender] or just rely on isActive.
        // Deleting is gas-refundable: delete userStakes[msg.sender];
    }

    // --- View Functions ---
    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return userStakes[user];
    }

    function getCalculatedUnlockTime(address user) external view returns (uint256) {
        StakeInfo storage stake = userStakes[user];
        require(stake.isActive, "Vault: No active stake for user");
        return stake.startTimestamp + stake.lockDuration;
    }

    // --- Admin Functions ---
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Vault: New admin cannot be zero address");
        admin = newAdmin;
    }

    function changeTreasury(address newTreasury) external onlyAdmin {
        require(newTreasury != address(0), "Vault: New treasury cannot be zero address");
        treasury = newTreasury;
    }
}