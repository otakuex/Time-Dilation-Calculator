# Time-Dilation-Calculator

# Gravity Drive Calculator

A small Node.js / Express web app for calculating relativistic travel times with reasonable precision for sci-fi storytelling purposes.

The app estimates the difference between time experienced by a stationary observer and time experienced by travelers aboard a ship moving at relativistic speeds. It is designed for practical story planning rather than ultra-high-precision physics research.

## Features

* Calculates travel time using observer-frame distances.
* Does not apply length contraction to the route distance.
* Supports two journey profiles:

  * Accelerate to target velocity, cruise, then decelerate.
  * Accelerate halfway, then decelerate halfway.
* Shows:

  * Total observer time.
  * Total ship time.
  * Time difference caused by relativistic time dilation.
  * Maximum velocity.
  * Required gravity drive output.
  * Phase breakdown for acceleration, cruise, deceleration, and total trip.
* Displays a velocity chart across the trip distance.
* Formats time in years and days for story-friendly use.

## Requirements

You need Node.js and npm installed.

Check whether they are installed:

```bash
node -v
npm -v
```

If both commands show version numbers, you are ready to continue.

## Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd <your-repository-folder>
```

Install dependencies:

```bash
npm install
```

This will recreate the `node_modules` directory locally.

## Running the App

Start the app:

```bash
node app.js
```

Then open this address in your browser:

```text
http://localhost:3001
```

If Chrome has trouble with `localhost`, try:

```text
http://127.0.0.1:3001
```

To stop the app, press:

```bash
Ctrl+C
```

## Optional: Add an npm Start Command

If `package.json` does not already include a start script, add this inside the `"scripts"` section:

```json
"scripts": {
  "start": "node app.js"
}
```

Then you can run the app with:

```bash
npm start
```

## Notes on Accuracy

This calculator is intended for science-fiction writing and worldbuilding. It aims to produce reasonable, internally consistent relativistic travel estimates, rounded to years and days.

It uses stationary-observer distances. For example, a 10-light-year trip is treated as 10 light-years from the stationary observer’s frame of reference.

Length contraction is not applied to the entered route distance.

## Suggested `.gitignore`

Do not upload `node_modules` to GitHub. Use a `.gitignore` file like this:

```gitignore
node_modules/
.env
.DS_Store
npm-debug.log*
```
