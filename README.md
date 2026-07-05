# Time-Dilation-Calculator

A small Node.js / Express web app for calculating relativistic travel times with reasonable precision for sci-fi storytelling and worldbuilding.

The app estimates the difference between:

- Time experienced by a stationary observer
- Time experienced by travelers aboard a ship moving at relativistic speeds

It is designed for practical story planning rather than ultra-high-precision physics research.

## Features

- Calculates travel time using observer-frame distances.
- Does not apply length contraction to the route distance.
- Supports two journey profiles:
  - Accelerate to target velocity, cruise, then decelerate.
  - Accelerate halfway, then decelerate halfway.
- Shows:
  - Total observer time
  - Total ship time
  - Time difference caused by relativistic time dilation
  - Maximum velocity
  - Required gravity drive output
  - Phase breakdown for acceleration, cruise, deceleration, and total trip
- Displays a velocity chart across the trip distance.
- Includes zoom controls for the velocity chart.
- Formats time in years and days for story-friendly use.

## Requirements

You need Node.js and npm installed.

Check whether they are already installed:

```bash
node -v
npm -v
```

If both commands show version numbers, continue to [Installation](#installation).

If either command is missing, install Node.js and npm using one of the options below.

## Installing Node.js and npm

### Option 1: Linux using apt

On Ubuntu, Linux Mint, Debian, or similar distributions, install Node.js and npm with:

```bash
sudo apt update
sudo apt install nodejs npm
```

Verify the installation:

```bash
node -v
npm -v
```

This is the simplest option and is usually good enough for running this app.

### Option 2: Linux or macOS using nvm

`nvm` is a Node.js version manager. It is useful if you want a newer Node.js version or want to switch between multiple Node.js versions.

Install `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
```

Load `nvm` into the current terminal session:

```bash
. "$HOME/.nvm/nvm.sh"
```

Install the latest long-term-support version of Node.js:

```bash
nvm install --lts
```

Verify the installation:

```bash
node -v
npm -v
```

### Option 3: Windows

Download and install the LTS version of Node.js from the official Node.js website.

npm is included with Node.js.

After installation, open PowerShell or Command Prompt and verify:

```powershell
node -v
npm -v
```

### Option 4: macOS using Homebrew

If you already use Homebrew, install Node.js with:

```bash
brew install node
```

Verify:

```bash
node -v
npm -v
```

## Installation

Clone the repository:

```bash
git clone https://github.com/otakuex/Time-Dilation-Calculator.git
cd Time-Dilation-Calculator
```

Install dependencies:

```bash
npm install
```

This installs the required packages listed in `package.json`, including Express. It will also recreate the `node_modules` directory locally.

## Running the App

Start the app:

```bash
node app.js
```

Then open this address in your browser:

```text
http://localhost:3001
```

If your browser has trouble with `localhost`, try:

```text
http://127.0.0.1:3001
```

To stop the app, press:

```bash
Ctrl+C
```

## Optional: npm Start Command

If `package.json` includes this script:

```json
"scripts": {
  "start": "node app.js"
}
```

then you can run the app with:

```bash
npm start
```

## Project Files

The main project files are:

```text
app.js
package.json
package-lock.json
README.md
.gitignore
```

Do not upload `node_modules` to GitHub. It is recreated automatically when someone runs:

```bash
npm install
```

## Suggested .gitignore

Use a `.gitignore` file like this:

```gitignore
node_modules/
.env
.DS_Store
npm-debug.log*
```

## Notes on Accuracy

This calculator is intended for science-fiction writing and worldbuilding.

It aims to produce reasonable, internally consistent relativistic travel estimates. Results are rounded to years and days because that level of precision is usually more useful for writing than exact hours, minutes, or seconds.

Distances are entered from the stationary observer’s frame of reference. For example, a 10-light-year trip is treated as 10 light-years from the stationary observer’s perspective.

Length contraction is not applied to the entered route distance.
