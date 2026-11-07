#!/usr/bin/env node
// verify_ui.js - Master Test Runner for Rustcord Discord Authentic UI (Tiers 1-4)
const { runTier1 } = require('./tier1_features.test');
const { runTier2 } = require('./tier2_boundaries.test');
const { runTier3 } = require('./tier3_combinations.test');
const { runTier4 } = require('./tier4_realworld.test');

function parseArgs() {
    const args = process.argv.slice(2);
    let tier = 'all';
    let json = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--tier=')) {
            tier = arg.split('=')[1].toLowerCase();
        } else if (arg === '-t' || arg === '--tier') {
            tier = (args[++i] || 'all').toLowerCase();
        } else if (arg === '--json') {
            json = true;
        }
    }
    return { tier, json };
}

async function main() {
    const { tier, json } = parseArgs();
    const overallStart = Date.now();

    if (!json) {
        console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
        console.log('\x1b[1m\x1b[35m   RUSTCORD DISCORD AUTHENTIC UI TEST SUITE (TIERS 1-4)   \x1b[0m');
        console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
        console.log(`Target: ${tier.toUpperCase()}`);
    }

    const tierResults = [];
    const runOpts = { silent: json };

    const selectedTiers = tier === 'all' ? ['1', '2', '3', '4'] : tier.split(',').map(t => t.trim());

    if (selectedTiers.includes('1')) {
        tierResults.push(await runTier1(runOpts));
    }
    if (selectedTiers.includes('2')) {
        tierResults.push(await runTier2(runOpts));
    }
    if (selectedTiers.includes('3')) {
        tierResults.push(await runTier3(runOpts));
    }
    if (selectedTiers.includes('4')) {
        tierResults.push(await runTier4(runOpts));
    }

    const overallDuration = Date.now() - overallStart;
    const totalTests = tierResults.reduce((acc, r) => acc + r.total, 0);
    const totalPassed = tierResults.reduce((acc, r) => acc + r.passed, 0);
    const totalFailed = tierResults.reduce((acc, r) => acc + r.failed, 0);

    if (json) {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            duration: overallDuration,
            total: totalTests,
            passed: totalPassed,
            failed: totalFailed,
            tiers: tierResults
        }, null, 2));
    } else {
        console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
        console.log('\x1b[1m   FINAL TEST SUITE SUMMARY   \x1b[0m');
        console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
        console.log(`  Total Tests Run: ${totalTests}`);
        console.log(`  Passed:          \x1b[32m${totalPassed}\x1b[0m`);
        console.log(`  Failed:          \x1b[${totalFailed > 0 ? '31' : '32'}m${totalFailed}\x1b[0m`);
        console.log(`  Total Duration:  ${overallDuration}ms`);
        console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
        if (totalFailed === 0) {
            console.log('\x1b[1m\x1b[32m✔ ALL TEST TIERS PASSED PERFECTLY!\x1b[0m\n');
        } else {
            console.log(`\x1b[1m\x1b[31m✖ ${totalFailed} TEST(S) FAILED. See diagnostic trace above.\x1b[0m\n`);
        }
    }

    process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test suite runner crashed:', err);
    process.exit(2);
});
