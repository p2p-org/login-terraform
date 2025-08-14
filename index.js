/**
 * Simplified script to generate Terraform CLI credentials
 * for multiple hostname + token pairs, with merging support.
 * 
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const core = require('@actions/core');
const io = require('@actions/io');

/**
 * Parse existing .terraformrc or terraform.rc credentials blocks.
 * Returns a map { hostname: token }
 */
function parseExistingCredentials(content) {
    const credsMap = {};
    const regex = /credentials\s+"([^"]+)"\s*\{\s*token\s*=\s*"([^"]+)"\s*\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        credsMap[match[1]] = match[2];
    }
    return credsMap;
}

/**
 * Convert a credentials map to HCL format.
 */
function serializeCredentials(credsMap) {
    return Object.entries(credsMap)
        .map(([hostname, token]) => `
credentials "${hostname}" {
  token = "${token}"
}`.trim())
        .join('\n\n');
}

/**
 * Add or merge multiple credentials into CLI config file
 * @param {Array<{hostname: string, token: string}>} credentialsList
 * @param {string} osPlat
 */
async function addMultipleCredentials(credentialsList, osPlat) {
    // Determine credentials file path
    let credsFile = osPlat === 'win32'
        ? `${process.env.APPDATA}/terraform.rc`
        : `${process.env.HOME}/.terraformrc`;

    // Allow override via environment variable
    credsFile = process.env.TF_CLI_CONFIG_FILE || credsFile;

    // Ensure folder exists
    const credsFolder = path.dirname(credsFile);
    await io.mkdirP(credsFolder);

    // Load existing credentials (if any)
    let existingContent = '';
    try {
        existingContent = await fs.readFile(credsFile, 'utf8');
    } catch {
        // File might not exist yet — that's fine
    }

    const credsMap = parseExistingCredentials(existingContent);

    // Merge new credentials
    for (const { hostname, token } of credentialsList) {
        credsMap[hostname] = token;
    }

    // Write merged credentials
    const finalContent = serializeCredentials(credsMap);
    await fs.writeFile(credsFile, finalContent);

    core.info(`✅ Terraform credentials updated at ${credsFile}`);
}

async function run() {
    try {
        const credsJson = core.getInput('cli_config_credentials_list');
        if (!credsJson) {
            throw new Error('No credentials list provided.');
        }

        let credentialsList;
        try {
            credentialsList = JSON.parse(credsJson);
        } catch {
            throw new Error('Invalid JSON for credentials list.');
        }

        if (!Array.isArray(credentialsList) || credentialsList.length === 0) {
            throw new Error('Credentials list must be a non-empty array.');
        }

        const osPlatform = os.platform();
        await addMultipleCredentials(credentialsList, osPlatform);
    } catch (error) {
        core.error(error.message);
        process.exit(1);
    }
}

module.exports = run;

if (require.main === module) {
    run();
}
