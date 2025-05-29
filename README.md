# Layer BTC - Enhanced Staking Simulation (Task 2)

This project presents an enhanced simulation of the stBTC liquid staking token system for Layer BTC, designed to work conceptually with Bitcoin staking via Babylon. This iteration (Task 2) builds upon the initial mock by incorporating time-based locking, basic APY accrual logic, comprehensive event emissions, and robust unit testing within a Hardhat environment.

## Table of Contents

- [Layer BTC - Enhanced Staking Simulation (Task 2)](#layer-btc---enhanced-staking-simulation-task-2)
  - [Table of Contents](#table-of-contents)
  - [1. Use-Case](#1-use-case)
  - [2. Contract Architecture](#2-contract-architecture)
  - [3. User/Staking Flow](#3-userstaking-flow)
  - [4. Key Features Simulated](#4-key-features-simulated)
  - [5. Security Assumptions \& Design Considerations](#5-security-assumptions--design-considerations)
  - [6. Local Project Setup](#6-local-project-setup)
  - [7. How to Deploy (Locally)](#7-how-to-deploy-locally)
  - [8. How to Test](#8-how-to-test)

## 1. Use-Case

Layer BTC aims to provide a liquid staking solution for Bitcoin. Users will be able to stake their native BTC through protocols like Babylon and, in return, receive `stBTC` – a yield-bearing, ERC-20 compliant token. This `stBTC` token can then be used across various DeFi applications, providing liquidity and utility to otherwise locked BTC. This project simulates the core smart contract mechanics for such a system.

## 2. Contract Architecture

The system comprises two main smart contracts:

- **`StBTC.sol`**:

  - An ERC-20 standard token representing the liquid staked Bitcoin.
  - Inherits from OpenZeppelin's `ERC20.sol` for standard token functionality and `Ownable.sol` for access control.
  - Minting and burning of `stBTC` tokens are restricted to the `Vault.sol` contract, ensuring that token supply is managed according to staked collateral.

- **`Vault.sol`**:
  - The core logic contract that manages the entire staking, minting, and redemption process for `stBTC`.
  - **Deposit Registration:** An `admin` (simulating a trusted oracle or bridge connected to Babylon) registers verified BTC deposits.
  - **Time-Locking:** Enforces a `stakingDuration` for each deposit, during which the principal (represented by `stBTC`) cannot be redeemed.
  - **APY Simulation:** Calculates conceptual yield based on a hardcoded APY (`5%`) and the staking duration. This reward is noted upon burning `stBTC`.
  - **Minting/Burning:** Handles the minting of `stBTC` to stakers upon successful deposit registration and the burning of `stBTC` upon redemption after the lock-up period.
  - **Event Emission:** Emits detailed events for all significant actions (deposit registration, minting, burning) for off-chain tracking and potential frontend integration.

## 3. User/Staking Flow

The simulated interaction flow is as follows:

1.  **(Off-Chain) BTC Staking via Babylon:** A user stakes their native Bitcoin using Babylon's staking mechanism. This process involves locking BTC on the Bitcoin blockchain according to Babylon's specifications and results in a unique transaction identifier (e.g., `btcTxHash`).
2.  **(Simulated Oracle) Deposit Registration:**
    - A trusted entity (the `admin` of the `Vault.sol` contract, simulating an oracle system or the Layer BTC backend) verifies the successful Babylon stake off-chain.
    - The `admin` then calls the `registerBtcDeposit(bytes32 btcTxHash, address staker, uint256 amount, uint256 stakingDuration, address finalityProvider)` function on the `Vault.sol` contract.
    - This records the stake details, including the principal `amount`, the `staker`'s address, the agreed `stakingDuration`, and the `depositTime` (set to `block.timestamp` of this transaction).
3.  **Minting `stBTC`:**
    - The `staker` (whose address was registered in step 2) calls the `mintStBTC(bytes32 btcTxHash)` function on `Vault.sol`, providing the unique `btcTxHash` of their deposit.
    - The `Vault.sol` contract verifies the deposit and mints an equivalent amount of `stBTC` tokens (1:1 with the principal BTC staked) to the `staker`.
4.  **Holding `stBTC` (Staking Period):**
    - The `staker` now holds `stBTC`, which can be used in DeFi (conceptually). The underlying BTC is considered locked for the `stakingDuration` specified.
5.  **Redemption (Burning `stBTC`):**
    - After the `stakingDuration` has elapsed (i.e., `block.timestamp >= depositTime + stakingDuration`), the `staker` can initiate redemption.
    - The `staker` calls the `burnStBTC(bytes32 btcTxHash)` function on `Vault.sol`.
    - The `Vault.sol` contract verifies that the lock-up period has passed and that the caller is the correct staker.
    - The `staker`'s `stBTC` (principal amount) is burned.
    - A conceptual reward amount is calculated based on the principal, the hardcoded APY (`5%`), and the `stakingDuration`.
    - The `StBTCBurned` event is emitted, including the principal burned and the calculated reward amount. _(Note: In a live system, the actual BTC principal and rewards would be released to the user from the Babylon system or a treasury, a process which is outside the scope of this EVM simulation)._

## 4. Key Features Simulated

This simulation demonstrates:

- **Oracle-based Deposit Registration:** Mimicking how an external system (like Babylon + Layer BTC oracle) would confirm stakes to the EVM contract.
- **Time-Based Locking:** Staked assets (represented by `stBTC`) are locked for a defined `stakingDuration`.
- **APY Accrual Simulation:** A conceptual calculation of yield based on a fixed APY and staking duration.
- **1:1 Backing of Principal:** `stBTC` is minted 1:1 against the principal BTC staked.
- **ERC-20 Compliance:** `stBTC` adheres to the ERC-20 standard.
- **Event-Driven Tracking:** Emission of events for key on-chain actions.
- **Access Control:** Proper use of `Ownable` for token control and an `admin` role for vault management.

## 5. Security Assumptions & Design Considerations

- **Admin Role Security:** The `admin` account in `Vault.sol` is a critical point of trust in this simulation. In a production system, this would be a secure multi-signature wallet, a decentralized oracle network, or a permissioned relayer system. Its compromise would allow fraudulent deposit registrations.
- **`btcTxHash` Uniqueness:** The `bytes32 btcTxHash` provided by the admin is assumed to be globally unique for each valid and distinct BTC deposit on Babylon. The contract prevents re-registration of the same `btcTxHash`.
- **Smart Contract Risks:** Standard smart contract risks (re-entrancy, integer overflow/underflow, etc.) apply. OpenZeppelin contracts are used for standard components to mitigate some of these. The current APY calculation is simple and uses basis points to handle percentages; care must be taken with fixed-point arithmetic in more complex financial calculations.
- **Gas Costs:** While not optimized for gas in this simulation, real-world deployment would require gas efficiency considerations.
- **Reward Distribution:** The current simulation only _calculates_ rewards and emits them in an event. A production system would need a separate mechanism and potentially a rewards pool to distribute actual BTC or other reward tokens.
- **No Slashing Logic:** This simulation does not include any slashing conditions or penalties that might exist in the underlying Babylon staking protocol.

## 6. Local Project Setup

To set up and run this project locally:

1.  **Clone the Repository:**
    ```bash
    git clone [YOUR_GITHUB_REPOSITORY_LINK]
    cd [YOUR_REPOSITORY_NAME]
    ```
2.  **Install Dependencies:**
    Ensure you have Node.js and npm (or Yarn) installed. Then, run:
    ```bash
    npm install
    ```
    This will install Hardhat and all necessary plugins and libraries defined in `package.json`.

## 7. How to Deploy (Locally)

The project includes a Hardhat script to deploy the contracts to a local Hardhat Network.

1.  **Start a Local Hardhat Node (Optional, if you want a persistent node):**
    ```bash
    npx hardhat node
    ```
    Then, in another terminal, run the deploy script targeting this node:
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
2.  **Deploy Directly to the In-Memory Hardhat Network:**
    If you don't start a separate node, this command will use a temporary in-memory Hardhat Network:
    ```bash
    npx hardhat run scripts/deploy.js
    ```
    _(Note: `--network localhost` is often the default for `npx hardhat run` if no other default is specified in `hardhat.config.js`)_

Upon successful deployment, the script will output the addresses of the deployed `StBTC` and `Vault` contracts to the console.

## 8. How to Test

The project includes comprehensive unit tests for the `Vault.sol` contract using Hardhat, Ethers.js, and Chai.

To run the tests:

```bash
npx hardhat test
```
