# Layer BTC - Time-Locked Staking Vault with Yield (Task 2)

This project implements an EVM-based smart contract system simulating a time-locked staking vault. Users can (conceptually) deposit BTC, receive `stBTC` tokens representing their principal, and earn yield in the form of additional `stBTC` based on a fixed APY and a configurable lock duration. This iteration focuses on user-centric staking, direct yield minting, and comprehensive event tracking.

## Table of Contents

- [Layer BTC - Time-Locked Staking Vault with Yield (Task 2)](#layer-btc---time-locked-staking-vault-with-yield-task-2)
  - [Table of Contents](#table-of-contents)
  - [1. Objective](#1-objective)
  - [2. Contract Architecture](#2-contract-architecture)
  - [3. User Staking Flow \& Mechanics](#3-user-staking-flow--mechanics)
    - [Depositing \& Staking](#depositing--staking)
    - [Time Lock](#time-lock)
    - [Yield Accrual \& Calculation](#yield-accrual--calculation)
    - [Withdrawal (Principal + Yield)](#withdrawal-principal--yield)
    - [Protocol Fee](#protocol-fee)
  - [4. Event Tracking](#4-event-tracking)
  - [5. Assumptions \& Simplifications](#5-assumptions--simplifications)
  - [6. Local Project Setup](#6-local-project-setup)
  - [7. How to Deploy (Locally)](#7-how-to-deploy-locally)
  - [8. How to Test](#8-how-to-test)

## 1. Objective

To extend the stBTC + Vault system to simulate a time-locked BTC staking mechanism where users directly interact with the vault, lock their stake for a chosen duration, and earn a fixed APY yield, which is paid out in `stBTC` upon withdrawal.

## 2. Contract Architecture

The system consists of two primary smart contracts:

- **`StBTC.sol`**:

  - An ERC-20 standard token (`stBTC`) that represents both the staked principal and the accrued yield.
  - Its minting and burning operations are exclusively controlled by the `Vault.sol` contract.

- **`Vault.sol`**:
  - The central contract managing user stakes, time locks, yield calculation, and `stBTC` lifecycle.
  - **User Stakes:** Maintains a record of each user's stake (`principalAmount`, `startTimestamp`, `lockDuration`, `isActive`, `hasWithdrawn`) in a `mapping(address => StakeInfo)`.
  - **Time-Locking:** Enforces the `lockDuration` chosen by the user at the time of deposit.
  - **Yield Generation:** Mints new `stBTC` tokens as yield to the user upon successful withdrawal after the lock period.
  - **Principal Management:** Mints `stBTC` for the principal upon deposit and burns it upon withdrawal.
  - **Admin & Treasury:** Includes an `admin` for contract management (e.g., changing the treasury address) and a `treasury` address to collect protocol fees on earned yield.

## 3. User Staking Flow & Mechanics

### Depositing & Staking

1.  A user calls the `depositAndStake(address staker, uint256 amount, uint256 lockDuration)` function on the `Vault.sol` contract.
    - `staker`: The address for whom the stake is being made (typically `msg.sender`).
    - `amount`: The principal amount of (conceptual) BTC being staked.
    - `lockDuration`: The duration (in seconds) for which the user wishes to lock their stake.
2.  The contract verifies that the user doesn't already have an active stake (this version supports one active stake per user).
3.  A `StakeInfo` entry is created for the user, recording the `principalAmount`, `lockDuration`, and setting `startTimestamp` to `block.timestamp`.
4.  The `Vault` contract mints `amount` of `stBTC` tokens (representing the principal) directly to the `staker`.
5.  Events `DepositRegistered` and `LockStarted` are emitted.

### Time Lock

- Once a deposit is made, the `principalAmount` is locked for the specified `lockDuration`, starting from the `startTimestamp`.
- Users cannot withdraw their principal or earned yield before `startTimestamp + lockDuration`.

### Yield Accrual & Calculation

- A fixed Annual Percentage Yield (APY) is defined in the contract (e.g., `5%`, stored as `APY_BASIS_POINTS = 500`).
- Yield is calculated proportionally to the `principalAmount` and the actual `timePassed` since the `startTimestamp` up to the point of withdrawal (or capped at `lockDuration` if a different policy is desired - current implementation uses actual time passed if withdrawal is after lock expiry).
- Formula (conceptual):
  `GrossYield = (Principal * APY_Basis_Points * TimePassedInSeconds) / (10000 * SecondsInYear)`

### Withdrawal (Principal + Yield)

1.  After the `lockDuration` has expired (`block.timestamp >= startTimestamp + lockDuration`), the staker calls the `withdraw()` function.
2.  The contract calculates the `grossYieldAmount` earned.
3.  A protocol fee (e.g., `1%`, defined by `PROTOCOL_FEE_BASIS_POINTS`) is deducted from the `grossYieldAmount`.
4.  The `netYieldAmount` (Gross Yield - Protocol Fee) of `stBTC` is minted to the staker.
5.  The `feeAmount` of `stBTC` is minted to the `treasury` address.
6.  The original `principalAmount` of `stBTC` is burned from the staker's balance.
7.  The user's `StakeInfo` is updated to mark the stake as withdrawn (`hasWithdrawn = true`, `isActive = false`) to prevent re-entry for the same stake.
8.  Events `YieldMinted` and `PrincipalWithdrawn` are emitted.

### Protocol Fee

- A small percentage (e.g., 1%) of the _earned gross yield_ is taken as a protocol fee.
- This fee is minted as `stBTC` and sent to a designated `treasury` address.

## 4. Event Tracking

The following events are emitted to track important actions:

- `DepositRegistered(address indexed user, uint256 amount)`: When a user's deposit is registered and principal `stBTC` is minted.
- `LockStarted(address indexed user, uint256 amount, uint256 duration)`: When the lock period for a user's stake begins.
- `YieldMinted(address indexed user, uint256 netYieldAmount, uint256 feeAmount)`: When yield `stBTC` (net to user and fee to treasury) is minted upon withdrawal.
- `PrincipalWithdrawn(address indexed user, uint256 amount)`: When a user's principal `stBTC` is burned upon withdrawal.

## 5. Assumptions & Simplifications

- **Single Active Stake Per User:** The current implementation allows only one active stake per user at a time. To deposit more or change lock duration, the user must first withdraw their existing stake.
- **Conceptual BTC Deposit:** The actual deposit of BTC to the vault is conceptual. The `depositAndStake` function initiates the record-keeping and `stBTC` minting on the EVM side.
- **Fixed APY:** The APY is hardcoded as a constant. In a real system, this might be variable and managed externally.
- **Yield Minting:** Yield is paid by minting new `stBTC`. This implies that `stBTC` becomes a yield-bearing token where its total supply grows not just from new principal but also from accrued yield.
- **Admin Role:** The `admin` can change the `treasury` address and its own `admin` address. For the `depositAndStake` function, it's currently designed to be callable by any user to simulate direct vault interaction.
- **No Slashing:** Slashing mechanisms are not included.
- **Gas Optimization:** Code is not specifically optimized for gas.

## 6. Local Project Setup

To set up and run this project locally:

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/uba2000/staking-solidity-structured
    cd staking-solidity-structured
    ```
2.  **Install Dependencies:**
    Ensure you have Node.js and npm (or Yarn) installed. Then, run:
    ```bash
    npm install
    ```
    This will install Hardhat and all necessary plugins and libraries defined in `package.json`.

## 7. How to Deploy (Locally)

The project includes a Hardhat script to deploy the contracts to a local Hardhat Network.

1. **Run Deployment Script:**
   ```bash
   npx hardhat run scripts/deploy.js
   ```
   _(This typically uses the default in-memory Hardhat Network. Add `--network localhost` if you have a separate `npx hardhat node` running)._

Upon successful deployment, the script will output the addresses of the deployed `StBTC` and `Vault` contracts, and the treasury address used.

## 8. How to Test

The project includes unit tests for the `Vault.sol` contract using Hardhat, Ethers.js, and Chai, covering the new user-centric staking flow, time-locks, yield minting, and withdrawal logic.

To run the tests:

```bash
npx hardhat test
```
