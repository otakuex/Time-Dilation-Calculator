const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));

// -----------------------------
// Constants and helper functions
// -----------------------------
const C = 1; // Speed of light in light-years per year.
const DAYS_PER_YEAR = 365.25;
const STANDARD_GRAVITY_M_PER_S2 = 9.80665;
const SECONDS_PER_YEAR = 31557600; // Julian year: 365.25 days.
const METERS_PER_LIGHT_YEAR = 9460730472580800;

// Converts real Earth g to light-years / year^2.
// 1g ≈ 1.0323 ly/yr^2.
const LY_PER_YEAR2_PER_G =
(STANDARD_GRAVITY_M_PER_S2 * SECONDS_PER_YEAR * SECONDS_PER_YEAR) / METERS_PER_LIGHT_YEAR;

function parsePositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function parseNonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseOptionalSpeedLimitPercent(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return {
            value: null,
            error: null,
        };
    }

    const text = String(value).trim();

    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        return {
            value: null,
            error: 'Maximum speed limit must be a number with up to two decimal places.',
        };
    }

    const number = Number(text);

    if (!Number.isFinite(number) || number <= 0 || number >= 100) {
        return {
            value: null,
            error: 'Maximum speed limit must be greater than 0 and less than 100.',
        };
    }

    return {
        value: number,
        error: null,
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function atanh(value) {
    return 0.5 * Math.log((1 + value) / (1 - value));
}

function gammaFromVelocity(v) {
    return 1 / Math.sqrt(1 - v * v);
}

function yearsToYearsDays(years) {
    if (!Number.isFinite(years)) return 'Invalid time';

    const wholeYears = Math.floor(years);
    const days = (years - wholeYears) * DAYS_PER_YEAR;
    const roundedDays = Math.round(days * 10) / 10;

    if (roundedDays >= DAYS_PER_YEAR) {
        return `${wholeYears + 1} years, 0.0 days`;
    }

    return `${wholeYears} ${wholeYears === 1 ? 'year' : 'years'}, ${roundedDays.toFixed(1)} days`;
}

function formatNumber(value, decimals = 4) {
    if (!Number.isFinite(value)) return 'Invalid';
    return Number(value.toFixed(decimals)).toString();
}

function formatPercent(value, decimals = 2) {
    if (!Number.isFinite(value)) return 'Invalid';
    return Number(value.toFixed(decimals)).toString();
}

function calculateHalfAccelerationTrip(totalDistanceLy, accelerationGs, speedLimitPercent = null) {
    const a = accelerationGs * LY_PER_YEAR2_PER_G;
    const halfDistance = totalDistanceLy / 2;

    // Unrestricted halfway acceleration result.
    const unrestrictedGammaMax = 1 + (a * halfDistance) / (C * C);
    const unrestrictedVMax = Math.sqrt(1 - 1 / (unrestrictedGammaMax * unrestrictedGammaMax));

    const hasLimiter = speedLimitPercent !== null;
    const speedLimitFraction = hasLimiter ? speedLimitPercent / 100 : null;

    // If no limiter is entered, or if the limiter is above the ship's natural halfway speed,
    // use the original accelerate-halfway/decelerate-halfway behavior.
    if (!hasLimiter || speedLimitFraction >= unrestrictedVMax) {
        const rapidity = Math.acosh(unrestrictedGammaMax);

        const shipHalfTime = (C / a) * rapidity;
        const observerHalfTime = (C / a) * Math.sinh(rapidity);

        const shipTotalTime = shipHalfTime * 2;
        const observerTotalTime = observerHalfTime * 2;

        return {
            mode: 'halfAcceleration',
            totalDistanceLy,
            accelerationGs,
            accelerationLyPerYear2: a,
            accelerationDistanceLy: halfDistance,
            cruiseDistanceLy: 0,
            decelerationDistanceLy: halfDistance,
            vMax: unrestrictedVMax,
            speedLimitPercent,
            speedLimitReached: false,
            shipAccelerationTime: shipHalfTime,
            observerAccelerationTime: observerHalfTime,
            shipCruiseTime: 0,
            observerCruiseTime: 0,
            shipDecelerationTime: shipHalfTime,
            observerDecelerationTime: observerHalfTime,
            shipTotalTime,
            observerTotalTime,
        };
    }

    // Limited-speed version:
    // Accelerate to speed limit, cruise, then decelerate to destination.
    const gammaLimit = gammaFromVelocity(speedLimitFraction);
    const rapidityLimit = atanh(speedLimitFraction);

    const accelerationDistanceLy = (C * C / a) * (gammaLimit - 1);
    const decelerationDistanceLy = accelerationDistanceLy;
    const cruiseDistanceLy = Math.max(0, totalDistanceLy - accelerationDistanceLy - decelerationDistanceLy);

    const observerAccelerationTime = (C / a) * Math.sinh(rapidityLimit);
    const shipAccelerationTime = (C / a) * rapidityLimit;

    const observerCruiseTime = cruiseDistanceLy / speedLimitFraction;
    const shipCruiseTime = observerCruiseTime / gammaLimit;

    const observerTotalTime = observerAccelerationTime + observerCruiseTime + observerAccelerationTime;
    const shipTotalTime = shipAccelerationTime + shipCruiseTime + shipAccelerationTime;

    return {
        mode: 'halfAcceleration',
        totalDistanceLy,
        accelerationGs,
        accelerationLyPerYear2: a,
        accelerationDistanceLy,
        cruiseDistanceLy,
        decelerationDistanceLy,
        vMax: speedLimitFraction,
        speedLimitPercent,
        speedLimitReached: true,
        shipAccelerationTime,
        observerAccelerationTime,
        shipCruiseTime,
        observerCruiseTime,
        shipDecelerationTime: shipAccelerationTime,
        observerDecelerationTime: observerAccelerationTime,
        shipTotalTime,
        observerTotalTime,
    };
}

function calculateTargetVelocityCruiseTrip(totalDistanceLy, targetVelocityPercent, accelerationDistanceLy, decelerationDistanceLy) {
    const vMax = targetVelocityPercent / 100;

    if (vMax <= 0 || vMax >= 1) {
        throw new Error('Target velocity must be greater than 0% and less than 100% of c.');
    }

    if (accelerationDistanceLy + decelerationDistanceLy > totalDistanceLy) {
        throw new Error('Acceleration distance plus deceleration distance cannot exceed total distance.');
    }

    const cruiseDistanceLy = totalDistanceLy - accelerationDistanceLy - decelerationDistanceLy;
    const gammaMax = gammaFromVelocity(vMax);
    const rapidity = atanh(vMax);

    function phaseFromDistance(distanceLy) {
        if (distanceLy === 0) {
            return {
                accelerationLyPerYear2: null,
                accelerationGs: null,
                observerTime: 0,
                shipTime: 0,
            };
        }

        // Solves for the proper acceleration needed to reach vMax over this observer-frame distance.
        const a = (C * C * (gammaMax - 1)) / distanceLy;
        const observerTime = (C / a) * Math.sinh(rapidity);
        const shipTime = (C / a) * rapidity;

        return {
            accelerationLyPerYear2: a,
            accelerationGs: a / LY_PER_YEAR2_PER_G,
            observerTime,
            shipTime,
        };
    }

    const accelPhase = phaseFromDistance(accelerationDistanceLy);
    const decelPhase = phaseFromDistance(decelerationDistanceLy);

    const observerCruiseTime = cruiseDistanceLy / vMax;
    const shipCruiseTime = observerCruiseTime / gammaMax;

    const observerTotalTime = accelPhase.observerTime + observerCruiseTime + decelPhase.observerTime;
    const shipTotalTime = accelPhase.shipTime + shipCruiseTime + decelPhase.shipTime;

    return {
        mode: 'targetVelocityCruise',
        totalDistanceLy,
        accelerationGs: accelPhase.accelerationGs,
        decelerationGs: decelPhase.accelerationGs,
        accelerationLyPerYear2: accelPhase.accelerationLyPerYear2,
        decelerationLyPerYear2: decelPhase.accelerationLyPerYear2,
        accelerationDistanceLy,
        cruiseDistanceLy,
        decelerationDistanceLy,
        vMax,
        gammaMax,
        speedLimitPercent: null,
        speedLimitReached: false,
        shipAccelerationTime: accelPhase.shipTime,
        observerAccelerationTime: accelPhase.observerTime,
        shipCruiseTime,
        observerCruiseTime,
        shipDecelerationTime: decelPhase.shipTime,
        observerDecelerationTime: decelPhase.observerTime,
        shipTotalTime,
        observerTotalTime,
    };
}

function generateChartData(results) {
    const numPoints = 120;
    const distances = [];
    const velocities = [];

    const totalDistance = results.totalDistanceLy;
    const accelDistance = results.accelerationDistanceLy;
    const cruiseDistance = results.cruiseDistanceLy;
    const decelStart = accelDistance + cruiseDistance;
    const vMax = results.vMax;

    for (let i = 0; i <= numPoints; i++) {
        const x = (totalDistance / numPoints) * i;
        let v = 0;

        if (x <= accelDistance && accelDistance > 0) {
            const gamma = 1 + (results.accelerationLyPerYear2 * x) / (C * C);
            v = Math.sqrt(1 - 1 / (gamma * gamma));
        } else if (x <= decelStart) {
            v = vMax;
        } else if (results.decelerationDistanceLy > 0) {
            const decelAcceleration = results.decelerationLyPerYear2 || results.accelerationLyPerYear2;
            const remainingDecelDistance = totalDistance - x;
            const gamma = 1 + (decelAcceleration * remainingDecelDistance) / (C * C);
            v = Math.sqrt(1 - 1 / (gamma * gamma));
        }

        distances.push(Number(x.toFixed(4)));
        velocities.push(Number((clamp(v, 0, 0.999999999999) * 100).toFixed(4)));
    }

    return { distances, velocities };
}

function buildResultsSummary(results) {
    const timeLost = results.observerTotalTime - results.shipTotalTime;
    const timeLostPercentage = results.observerTotalTime > 0 ? (timeLost / results.observerTotalTime) * 100 : 0;

    return {
        ...results,
        timeLost,
        timeLostPercentage,
        chartData: generateChartData(results),
    };
}

// -----------------------------
// Routes
// -----------------------------
app.all('/', (req, res) => {
    if (req.method === 'GET') {
        res.send(renderForm());
        return;
    }

    const journeyMode = req.body.journeyMode || 'targetVelocityCruise';
    const errors = [];

    const totalDistanceLy = parsePositiveNumber(req.body.distance);
    if (totalDistanceLy === null) {
        errors.push('Total distance is required and must be a positive number.');
    }

    try {
        let rawResults;

        if (journeyMode === 'halfAcceleration') {
            const accelerationGs = parsePositiveNumber(req.body.acceleration);
            const speedLimitResult = parseOptionalSpeedLimitPercent(req.body.speedLimit);

            if (accelerationGs === null) {
                errors.push('Gravity drive output is required and must be a positive number.');
            }

            if (speedLimitResult.error) {
                errors.push(speedLimitResult.error);
            }

            if (errors.length > 0) {
                res.send(renderForm(errors, req.body));
                return;
            }

            rawResults = calculateHalfAccelerationTrip(
                totalDistanceLy,
                accelerationGs,
                speedLimitResult.value
            );
        } else if (journeyMode === 'targetVelocityCruise') {
            const targetVelocityPercent = parsePositiveNumber(req.body.targetVelocity);
            const accelerationDistanceLy = parseNonNegativeNumber(req.body.accelerationDistance);
            const decelerationDistanceLy = parseNonNegativeNumber(req.body.decelerationDistance);

            if (targetVelocityPercent === null || targetVelocityPercent >= 100) {
                errors.push('Target velocity is required and must be greater than 0 and less than 100.');
            }

            if (accelerationDistanceLy === null) {
                errors.push('Acceleration distance is required and must be zero or greater.');
            }

            if (decelerationDistanceLy === null) {
                errors.push('Deceleration distance is required and must be zero or greater.');
            }

            if (
                totalDistanceLy !== null &&
                accelerationDistanceLy !== null &&
                decelerationDistanceLy !== null &&
                accelerationDistanceLy + decelerationDistanceLy > totalDistanceLy
            ) {
                errors.push('Acceleration distance plus deceleration distance cannot exceed total distance.');
            }

            if (errors.length > 0) {
                res.send(renderForm(errors, req.body));
                return;
            }

            rawResults = calculateTargetVelocityCruiseTrip(
                totalDistanceLy,
                targetVelocityPercent,
                accelerationDistanceLy,
                decelerationDistanceLy
            );
        } else {
            errors.push('Unknown journey mode.');
            res.send(renderForm(errors, req.body));
            return;
        }

        const results = buildResultsSummary(rawResults);
        res.send(renderForm(null, buildFormDataFromResults(results), results));
    } catch (error) {
        errors.push(error.message || 'An error occurred during calculations. Please check your inputs.');
        res.send(renderForm(errors, req.body));
    }
});

function buildFormDataFromResults(results) {
    return {
        journeyMode: results.mode,
        distance: results.totalDistanceLy,
        acceleration: results.accelerationGs ?? '',
        speedLimit: results.speedLimitPercent ?? '',
        targetVelocity: results.vMax * 100,
        accelerationDistance: results.accelerationDistanceLy,
        decelerationDistance: results.decelerationDistanceLy,
    };
}

// -----------------------------
// Rendering
// -----------------------------
function renderForm(errors = null, formData = {}, results = null) {
    const {
        journeyMode = 'targetVelocityCruise',
        distance = '20',
        acceleration = '1',
        speedLimit = '',
        targetVelocity = '99',
        accelerationDistance = '1',
        decelerationDistance = '1',
    } = formData;

    const errorMessages = errors
    ? `<div class="error-box"><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>`
    : '';

    const resultsSection = results ? renderResults(results) : '';
    const chartScript = results ? renderChartScript(results.chartData) : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
    <title>Gravity Drive Calculator</title>
    <style>
    body {
        background-color: #121212;
        color: #e0e0e0;
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
    }

    .container {
        max-width: 760px;
        margin: 2em auto;
        padding: 1em;
    }

    h1, h2, h3 {
        text-align: center;
    }

    form {
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    fieldset {
        border: 1px solid #444;
        border-radius: 8px;
        padding: 1em;
    }

    legend {
        padding: 0 0.5em;
        color: #ffffff;
        font-weight: bold;
    }

    .mode-option {
        display: block;
        margin: 0.5em 0;
        line-height: 1.4;
    }

    .input-group {
        display: grid;
        grid-template-columns: minmax(210px, 1fr) 1fr;
        gap: 1em;
        align-items: center;
        margin: 0.75em 0;
    }

    .input-group input[type="number"] {
        background-color: #2b2b2b;
        color: #e0e0e0;
        border: none;
        padding: 0.6em;
        border-radius: 5px;
    }

    input[type="number"]:focus {
        outline: 1px solid #1e88e5;
        background-color: #3b3b3b;
    }

    button {
        margin-top: 0.5em;
        padding: 0.85em;
        background-color: #1e88e5;
        color: #ffffff;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 1em;
    }

    button:hover:not(:disabled) {
        background-color: #42a5f5;
    }

    button:disabled {
        background-color: #555;
        color: #999;
        cursor: not-allowed;
        opacity: 0.7;
    }

    .error-box, .results-box, .note-box {
        background-color: #2b2b2b;
        padding: 1em;
        border-radius: 5px;
        margin-top: 1.25em;
        position: relative;
    }

    .error-box {
        color: #ff6b8a;
    }

    .error-box ul {
        list-style-type: none;
        padding-left: 0;
    }

    .note-box {
        color: #bdbdbd;
        line-height: 1.45;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1em;
    }

    th, td {
        border-bottom: 1px solid #444;
        padding: 0.65em;
        text-align: left;
    }

    th {
        color: #ffffff;
    }

    .total-row td {
        border-top: 2px solid #777;
        color: #ffffff;
    }

    .small {
        color: #bdbdbd;
        font-size: 0.92em;
    }

    #copy-button {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 0.45em 0.7em;
    margin: 0;
    }

    .chart-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.75em;
        margin-bottom: 1em;
        flex-wrap: wrap;
    }

    .chart-controls button {
        margin-top: 0;
        padding: 0.55em 0.9em;
    }

    #zoom-level-label {
    color: #bdbdbd;
    min-width: 90px;
    text-align: center;
    font-size: 0.95em;
    }

    .chart-scroll-container {
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 0.5em;
    }

    .chart-scroll-container::-webkit-scrollbar {
        height: 10px;
    }

    .chart-scroll-container::-webkit-scrollbar-track {
        background: #1e1e1e;
        border-radius: 5px;
    }

    .chart-scroll-container::-webkit-scrollbar-thumb {
        background: #555;
        border-radius: 5px;
    }

    .chart-scroll-container::-webkit-scrollbar-thumb:hover {
        background: #777;
    }

    #chart-inner {
    width: 100%;
    height: 390px;
    position: relative;
    transition: width 0.18s ease-in-out;
    }

    #velocityChart {
    width: 100% !important;
    height: 390px !important;
    }

    .hidden {
        display: none;
    }

    @media (max-width: 650px) {
        .container {
            padding: 1em;
        }

        .input-group {
            grid-template-columns: 1fr;
            gap: 0.4em;
        }

        #copy-button {
        position: static;
        float: right;
        margin-bottom: 1em;
        }
    }
    </style>
    </head>
    <body>
    <div class="container">
    <h1>Gravity Drive Calculator</h1>

    <div class="note-box">
    Distances are treated as stationary-observer distances. No length contraction is applied to the route distance. Times are rounded for storytelling use to years plus days.
    </div>

    <form action="/" method="POST" id="calculator-form">
    ${errorMessages}

    <fieldset>
    <legend>Journey Profile</legend>
    <label class="mode-option">
    <input type="radio" name="journeyMode" value="targetVelocityCruise" ${journeyMode === 'targetVelocityCruise' ? 'checked' : ''}>
    Accelerate to target speed, cruise, then decelerate
    </label>
    <label class="mode-option">
    <input type="radio" name="journeyMode" value="halfAcceleration" ${journeyMode === 'halfAcceleration' ? 'checked' : ''}>
    Accelerate to halfway point, then decelerate to destination
    </label>
    </fieldset>

    <fieldset>
    <legend>Trip</legend>
    <div class="input-group">
    <label for="distance">Total Distance (light-years):</label>
    <input type="number" name="distance" id="distance" required min="0.0001" step="any" value="${escapeHtml(distance)}">
    </div>
    </fieldset>

    <fieldset id="targetVelocityFields">
    <legend>Target Velocity + Cruise Mode</legend>
    <div class="input-group">
    <label for="targetVelocity">Target / Cruise Velocity (% of c):</label>
    <input type="number" name="targetVelocity" id="targetVelocity" min="0.0001" max="99.999999" step="any" value="${escapeHtml(targetVelocity)}">
    </div>
    <div class="input-group">
    <label for="accelerationDistance">Acceleration Distance (light-years):</label>
    <input type="number" name="accelerationDistance" id="accelerationDistance" min="0" step="any" value="${escapeHtml(accelerationDistance)}">
    </div>
    <div class="input-group">
    <label for="decelerationDistance">Deceleration Distance (light-years):</label>
    <input type="number" name="decelerationDistance" id="decelerationDistance" min="0" step="any" value="${escapeHtml(decelerationDistance)}">
    </div>
    <p class="small">Example: 20 ly total, 99% c, 1 ly acceleration, 1 ly deceleration gives an 18 ly cruise.</p>
    </fieldset>

    <fieldset id="halfAccelerationFields">
    <legend>Halfway Acceleration Mode</legend>
    <div class="input-group">
    <label for="acceleration">Gravity Drive Output (g):</label>
    <input type="number" name="acceleration" id="acceleration" min="0.01" step="0.01" value="${escapeHtml(acceleration)}">
    </div>
    <div class="input-group">
    <label for="speedLimit">Maximum Speed Limit (% of c, optional):</label>
    <input type="number" name="speedLimit" id="speedLimit" min="0.01" max="99.99" step="0.01" value="${escapeHtml(speedLimit)}" placeholder="No limit">
    </div>
    <p class="small">Leave blank for no speed limit. If entered, the ship accelerates to this speed, cruises, then decelerates. Uses real Earth gravity conversion: 1g ≈ ${formatNumber(LY_PER_YEAR2_PER_G, 6)} ly/yr².</p>
    </fieldset>

    <button type="submit">Calculate</button>
    </form>

    ${resultsSection}
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const modeRadios = document.querySelectorAll('input[name="journeyMode"]');
        const targetVelocityFields = document.getElementById('targetVelocityFields');
        const halfAccelerationFields = document.getElementById('halfAccelerationFields');
        const copyButton = document.getElementById('copy-button');

        function updateModeVisibility() {
            const selected = document.querySelector('input[name="journeyMode"]:checked').value;
            targetVelocityFields.classList.toggle('hidden', selected !== 'targetVelocityCruise');
            halfAccelerationFields.classList.toggle('hidden', selected !== 'halfAcceleration');
        }

        modeRadios.forEach((radio) => radio.addEventListener('change', updateModeVisibility));
        updateModeVisibility();

        if (copyButton) {
            copyButton.addEventListener('click', () => {
                const resultsText = document.getElementById('results-text').innerText;
                navigator.clipboard.writeText(resultsText)
                .then(() => alert('Results copied to clipboard.'))
                .catch((err) => alert('Failed to copy results: ' + err));
            });
        }
    });
    </script>

    ${chartScript}
    </body>
    </html>`;
}

function renderResults(results) {
    const maxVelocityPercent = results.vMax * 100;
    const timeLost = results.timeLost;
    const timeLostPercentage = results.timeLostPercentage;

    const accelerationText = results.mode === 'halfAcceleration'
    ? `${formatNumber(results.accelerationGs, 4)} g`
    : `${formatNumber(results.accelerationGs, 4)} g acceleration / ${formatNumber(results.decelerationGs, 4)} g deceleration`;

    const speedLimitLine = results.mode === 'halfAcceleration' && results.speedLimitPercent !== null
    ? `<p><strong>Maximum Speed Limit:</strong> ${formatPercent(results.speedLimitPercent, 2)}% of c ${results.speedLimitReached ? '(reached; cruise phase added)' : '(not reached before halfway point)'}</p>`
    : '';

    const cruiseLine = results.cruiseDistanceLy > 0
    ? `<tr><td>Cruise</td><td>${formatNumber(results.cruiseDistanceLy, 4)} ly</td><td>${yearsToYearsDays(results.observerCruiseTime)}</td><td>${yearsToYearsDays(results.shipCruiseTime)}</td></tr>`
    : '';

    return `
    <div class="results-box">
    <button id="copy-button" type="button" title="Copy Results to Clipboard">Copy</button>
    <h2>Results</h2>
    <div id="results-text">
    <p><strong>Total Distance:</strong> ${formatNumber(results.totalDistanceLy, 4)} light-years</p>
    <p><strong>Journey Profile:</strong> ${results.mode === 'halfAcceleration' ? 'Accelerate to halfway point, then decelerate to destination' : 'Accelerate, cruise, decelerate'}</p>
    <p><strong>Maximum Velocity:</strong> ${formatPercent(maxVelocityPercent, 4)}% of c</p>
    ${speedLimitLine}
    <p><strong>Required Gravity Drive Output:</strong> ${accelerationText}</p>
    <p><strong>Total Observer Time:</strong> ${yearsToYearsDays(results.observerTotalTime)} (${formatNumber(results.observerTotalTime, 4)} years)</p>
    <p><strong>Total Ship Time:</strong> ${yearsToYearsDays(results.shipTotalTime)} (${formatNumber(results.shipTotalTime, 4)} years)</p>
    <p><strong>Time Difference:</strong> ${yearsToYearsDays(timeLost)} (${formatNumber(timeLost, 4)} years, ${formatPercent(timeLostPercentage, 2)}% of observer time)</p>

    <h3>Phase Breakdown</h3>
    <table>
    <thead>
    <tr>
    <th>Phase</th>
    <th>Distance</th>
    <th>Observer Time</th>
    <th>Ship Time</th>
    </tr>
    </thead>
    <tbody>
    <tr>
    <td>Acceleration</td>
    <td>${formatNumber(results.accelerationDistanceLy, 4)} ly</td>
    <td>${yearsToYearsDays(results.observerAccelerationTime)}</td>
    <td>${yearsToYearsDays(results.shipAccelerationTime)}</td>
    </tr>
    ${cruiseLine}
    <tr>
    <td>Deceleration</td>
    <td>${formatNumber(results.decelerationDistanceLy, 4)} ly</td>
    <td>${yearsToYearsDays(results.observerDecelerationTime)}</td>
    <td>${yearsToYearsDays(results.shipDecelerationTime)}</td>
    </tr>
    <tr class="total-row">
    <td><strong>Total</strong></td>
    <td><strong>${formatNumber(results.totalDistanceLy, 4)} ly</strong></td>
    <td><strong>${yearsToYearsDays(results.observerTotalTime)}</strong></td>
    <td><strong>${yearsToYearsDays(results.shipTotalTime)}</strong></td>
    </tr>
    </tbody>
    </table>
    </div>
    </div>
    <div class="results-box">
    <div class="chart-controls">
    <button id="zoom-out-button" type="button" disabled>Zoom Out</button>
    <span id="zoom-level-label">Zoom 0 / 5</span>
    <button id="zoom-in-button" type="button">Zoom In</button>
    </div>
    <div class="chart-scroll-container" id="chart-scroll-container">
    <div id="chart-inner">
    <canvas id="velocityChart"></canvas>
    </div>
    </div>
    </div>`;
}

function renderChartScript(chartData) {
    return `
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
    const ctx = document.getElementById('velocityChart').getContext('2d');
    const chartInner = document.getElementById('chart-inner');
    const chartScrollContainer = document.getElementById('chart-scroll-container');
    const zoomInButton = document.getElementById('zoom-in-button');
    const zoomOutButton = document.getElementById('zoom-out-button');
    const zoomLevelLabel = document.getElementById('zoom-level-label');

    let zoomLevel = 0;
    const maxZoomLevel = 5;
    const zoomWidthMultipliers = [1, 1.75, 2.5, 3.5, 4.75, 6];

    function distanceLabelDecimalsForZoom(level) {
        if (level <= 0) return 2;
        if (level <= 2) return 3;
        return 4;
    }

    function maxTicksForZoom(level) {
        return 8 + level * 5;
    }

    const data = {
        labels: ${JSON.stringify(chartData.distances)},
        datasets: [{
            label: 'Velocity (% of c)',
            data: ${JSON.stringify(chartData.velocities)},
            borderColor: '#1e88e5',
            backgroundColor: 'rgba(30, 136, 229, 0.2)',
            fill: true,
            tension: 0.1,
        }]
    };

    const velocityChart = new Chart(ctx, {
        type: 'line',
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    labels: { color: '#e0e0e0' }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Distance (light-years)',
                                    color: '#e0e0e0'
                    },
                    ticks: {
                        color: '#e0e0e0',
                        autoSkip: true,
                        maxTicksLimit: maxTicksForZoom(zoomLevel),
                                    callback: function(value) {
                                        const num = Number(this.getLabelForValue(value));
                                        const decimals = distanceLabelDecimalsForZoom(zoomLevel);
                                        return Number(num.toFixed(decimals)).toString();
                                    }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Velocity (% of c)',
                                    color: '#e0e0e0'
                    },
                    ticks: { color: '#e0e0e0' },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    function updateZoomControls() {
        const widthPercent = zoomWidthMultipliers[zoomLevel] * 100;
        chartInner.style.width = widthPercent + '%';

        velocityChart.options.scales.x.ticks.maxTicksLimit = maxTicksForZoom(zoomLevel);
        velocityChart.update('none');

        zoomOutButton.disabled = zoomLevel === 0;
        zoomInButton.disabled = zoomLevel === maxZoomLevel;
        zoomLevelLabel.textContent = 'Zoom ' + zoomLevel + ' / ' + maxZoomLevel;

        if (zoomLevel === 0) {
            chartScrollContainer.scrollLeft = 0;
        }
    }

    zoomInButton.addEventListener('click', () => {
        if (zoomLevel >= maxZoomLevel) return;

        const previousScrollRatio = chartScrollContainer.scrollLeft /
        Math.max(1, chartScrollContainer.scrollWidth - chartScrollContainer.clientWidth);

        zoomLevel += 1;
        updateZoomControls();

        const newMaxScroll = chartScrollContainer.scrollWidth - chartScrollContainer.clientWidth;
        chartScrollContainer.scrollLeft = previousScrollRatio * newMaxScroll;
    });

    zoomOutButton.addEventListener('click', () => {
        if (zoomLevel <= 0) return;

        const previousScrollRatio = chartScrollContainer.scrollLeft /
        Math.max(1, chartScrollContainer.scrollWidth - chartScrollContainer.clientWidth);

        zoomLevel -= 1;
        updateZoomControls();

        const newMaxScroll = chartScrollContainer.scrollWidth - chartScrollContainer.clientWidth;
        chartScrollContainer.scrollLeft = previousScrollRatio * newMaxScroll;
    });

    updateZoomControls();
    </script>`;
}

function escapeHtml(value) {
    return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

app.listen(3001, () => {
    console.log('Gravity Drive Calculator running at http://localhost:3001');
});
