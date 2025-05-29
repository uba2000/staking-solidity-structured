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

/// @title Vault Contract for Staked BTC (stBTC)
/// @author [Your Name]
/// @notice This contract manages the minting and burning of stBTC tokens,
/// representing BTC staked via a simulated Babylon-like system. It includes
/// time-based locking and a conceptual APY calculation.
contract Vault {
    /// @notice Interface to the StBTC ERC20 token contract.
    IStBTC public stBTC_token;
    /// @notice Address of the admin, responsible for registering verified BTC deposits.
    /// @dev This simulates an oracle or trusted bridge from Babylon.
    address public admin;

    /// @notice Annual Percentage Yield in basis points (e.g., 500 = 5.00%).
    uint256 public constant APY_BASIS_POINTS = 500; // 5.00% APY
    /// @notice Number of seconds in a year, used for APY calculation.
    uint256 public constant SECONDS_IN_YEAR = 365 days; // Using 'days' keyword for clarity

    /// @notice Structure to store details of a BTC deposit.
    struct BtcVault {
        uint256 amount;           // The principal amount of BTC staked.
        address finalityProvider; // Address of the (simulated) Babylon finality provider.
        address staker;           // The address that staked BTC and should receive stBTC.
        bool registered;          // True if the deposit has been registered by admin.
        bool minted;              // True if stBTC has been minted for this deposit.
        uint256 depositTime;      // Timestamp when the deposit was registered/staked.
        uint256 stakingDuration;  // Duration (in seconds) for which BTC is locked.
    }

    /// @notice Mapping from a BTC transaction hash (or unique deposit ID) to its vault details.
    mapping(bytes32 => BtcVault) public vaults;

    /// @notice Emitted when a new BTC deposit is registered by the admin.
    /// @param btcTxHash Unique identifier for the BTC deposit.
    /// @param staker The address of the user who staked BTC.
    /// @param amount The amount of BTC staked.
    /// @param depositTime Timestamp of the deposit registration.
    /// @param stakingDuration The agreed duration for the stake.
    /// @param finalityProvider The (simulated) finality provider for the stake.
    event DepositRegistered(
        bytes32 indexed btcTxHash,
        address indexed staker,
        uint256 amount,
        uint256 depositTime,
        uint256 stakingDuration,
        address finalityProvider
    );

    /// @notice Emitted when stBTC is minted for a registered deposit.
    /// @param btcTxHash Unique identifier for the BTC deposit.
    /// @param staker The address receiving the stBTC.
    /// @param amount The amount of stBTC minted (principal).
    event StBTCMinted(
        bytes32 indexed btcTxHash,
        address indexed staker,
        uint256 amount
    );

    /// @notice Emitted when stBTC is burned, typically after the staking duration.
    /// @param btcTxHash Unique identifier for the BTC deposit.
    /// @param staker The address whose stBTC is burned.
    /// @param principalAmountBurned The amount of principal stBTC burned.
    /// @param rewardAmountCalculated The conceptual reward amount calculated based on APY and duration.
    event StBTCBurned(
        bytes32 indexed btcTxHash,
        address indexed staker,
        uint256 principalAmountBurned,
        uint256 rewardAmountCalculated
    );

    /// @notice Modifier to restrict function access to the admin only.
    modifier onlyAdmin() {
        require(msg.sender == admin, "Vault: Caller is not the admin");
        _;
    }

    /// @notice Contract constructor.
    /// @param _stBTCTokenAddress The address of the deployed StBTC token contract.
    constructor(address _stBTCTokenAddress) {
        stBTC_token = IStBTC(_stBTCTokenAddress);
        admin = msg.sender; // The deployer is set as the initial admin.
    }

    /// @notice Admin function to register a verified BTC deposit.
    /// @dev This simulates an oracle confirming a BTC stake on Babylon and relaying details.
    /// @param btcTxHash A unique identifier for the BTC staking transaction.
    /// @param staker The address of the user who staked the BTC.
    /// @param amount The amount of BTC staked (in smallest units, e.g., satoshis or wei-equivalent).
    /// @param stakingDuration The duration in seconds for which the BTC will be staked.
    /// @param finalityProvider The address of the (simulated) finality provider from Babylon.
    function registerBtcDeposit(
        bytes32 btcTxHash,
        address staker,
        uint256 amount,
        uint256 stakingDuration, // Changed from unlockTime
        address finalityProvider
    ) external onlyAdmin {
        require(staker != address(0), "Vault: Staker address cannot be zero");
        require(amount > 0, "Vault: Amount must be greater than zero");
        require(stakingDuration > 0, "Vault: Staking duration must be positive"); // e.g., minimum 1 day
        require(finalityProvider != address(0), "Vault: Finality provider cannot be zero address");
        require(!vaults[btcTxHash].registered, "Vault: Deposit already registered for this TxHash");

        uint256 currentTimestamp = block.timestamp;

        vaults[btcTxHash] = BtcVault({
            amount: amount,
            finalityProvider: finalityProvider,
            staker: staker,
            registered: true,
            minted: false,
            depositTime: currentTimestamp,       // Set deposit time
            stakingDuration: stakingDuration   // Set staking duration
        });

        emit DepositRegistered(btcTxHash, staker, amount, currentTimestamp, stakingDuration, finalityProvider);
    }

    /// @notice Allows a staker to mint stBTC for their registered and verified BTC deposit.
    /// @dev The caller (msg.sender) must be the `staker` recorded during `registerBtcDeposit`.
    /// @param btcTxHash The unique identifier of the BTC deposit for which to mint stBTC.
    function mintStBTC(bytes32 btcTxHash) external {
        BtcVault storage vault = vaults[btcTxHash];

        require(vault.registered, "Vault: Deposit not registered or invalid TxHash");
        require(msg.sender == vault.staker, "Vault: Caller is not the registered staker for this deposit");
        // Unlock time (calculated) must still be in the future conceptually,
        // though minting can happen anytime after registration before unlock.
        // The main check is that the deposit itself is valid.
        require(vault.depositTime + vault.stakingDuration > block.timestamp, "Vault: Staking period already ended (safety check)");
        require(vault.finalityProvider != address(0), "Vault: Finality provider not assigned (safety check)");
        require(!vault.minted, "Vault: stBTC already minted for this deposit");

        vault.minted = true;
        stBTC_token.mint(vault.staker, vault.amount);

        emit StBTCMinted(btcTxHash, vault.staker, vault.amount);
    }

    /// @notice Allows a staker to burn their stBTC after the staking duration to (conceptually)
    /// @dev reclaim their principal BTC and accrued rewards.
    /// @param btcTxHash The unique identifier of the BTC deposit.
    function burnStBTC(bytes32 btcTxHash) external {
        BtcVault storage vault = vaults[btcTxHash];
        uint256 calculatedUnlockTime = vault.depositTime + vault.stakingDuration;

        require(vault.minted, "Vault: No stBTC minted for this deposit or already burned");
        require(msg.sender == vault.staker, "Vault: Caller is not the staker for this deposit");
        require(block.timestamp >= calculatedUnlockTime, "Vault: Staking duration not yet reached");
        require(stBTC_token.balanceOf(msg.sender) >= vault.amount, "Vault: Insufficient stBTC balance to burn");

        uint256 principalAmountToBurn = vault.amount;

        // Calculate conceptual rewards
        // Rewards = (Principal * APY_Basis_Points * Staking_Duration_In_Years) / 10000
        // Staking_Duration_In_Years = vault.stakingDuration / SECONDS_IN_YEAR
        // To avoid precision loss with division early, multiply first:
        // rewards = (principal * APY_BASIS_POINTS * vault.stakingDuration) / (10000 * SECONDS_IN_YEAR)
        uint256 rewardAmountCalculated = (principalAmountToBurn * APY_BASIS_POINTS * vault.stakingDuration) / (10000 * SECONDS_IN_YEAR);
        
        // In a real system, these rewards would be sourced from a reward pool or treasury.
        // For this simulation, we just calculate and emit it. The user only burns their principal stBTC.

        vault.minted = false; // Mark as no longer minted / effectively redeemed.
                              // Could also set vault.registered = false if txHash should be reusable, but typically not.

        stBTC_token.burnFrom(msg.sender, principalAmountToBurn);

        emit StBTCBurned(btcTxHash, msg.sender, principalAmountToBurn, rewardAmountCalculated);
    }

    /// @notice Allows the current admin to change the admin address.
    /// @param newAdmin The address of the new admin.
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Vault: New admin cannot be zero address");
        admin = newAdmin;
    }

    /// @notice Utility view function to get the calculated unlock time for a deposit.
    /// @param btcTxHash The unique identifier of the BTC deposit.
    /// @return The calculated unlock timestamp.
    function getCalculatedUnlockTime(bytes32 btcTxHash) external view returns (uint256) {
        BtcVault storage vault = vaults[btcTxHash];
        require(vault.registered, "Vault: Deposit not registered");
        return vault.depositTime + vault.stakingDuration;
    }
}