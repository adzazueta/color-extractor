import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

async function loadHarness() {
    const { generateCorpus, generateManifest } = await import(
        '../benchmarks/corpus/generator.js'
    );
    const { runBenchmarkSuite } = await import(
        '../benchmarks/harness/runner.js'
    );
    return { generateCorpus, generateManifest, runBenchmarkSuite };
}

async function handleCorpus() {
    console.log('Generating benchmark corpus and updating manifest.json...');
    const { generateCorpus, generateManifest } = await loadHarness();
    const corpus = generateCorpus();
    const manifest = generateManifest(corpus);

    const manifestPath = resolve(rootDir, 'benchmarks/corpus/manifest.json');
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), 'utf8');

    console.log(
        `✓ Corpus manifest generated with ${manifest.fixtures.length} fixtures at:`,
    );
    console.log(`  ${manifestPath}`);
}

async function handleRun(isSmoke = false, isBaseline = false) {
    const mode = isSmoke ? 'smoke' : isBaseline ? 'baseline' : 'full';
    console.log(`Running algorithm benchmark suite (${mode} mode)...`);

    const { generateCorpus, runBenchmarkSuite } = await loadHarness();
    const corpus = generateCorpus();

    const runnerOptions = {
        warmupRuns: 10,
        measuredRuns: isSmoke ? 10 : 50,
    };

    const report = await runBenchmarkSuite(corpus, runnerOptions);

    if (isBaseline) {
        const baselinePath = resolve(
            rootDir,
            'benchmarks/baselines/lab-kmeans-v0.2.json',
        );
        mkdirSync(dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, JSON.stringify(report, null, 4), 'utf8');
        console.log(`✓ Checked-in baseline written to ${baselinePath}`);
    } else {
        const reportsDir = resolve(rootDir, 'benchmarks/reports');
        mkdirSync(reportsDir, { recursive: true });
        const timeStr = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = resolve(reportsDir, `report-${timeStr}.json`);
        const latestPath = resolve(reportsDir, 'latest.json');
        const reportJson = JSON.stringify(report, null, 2);
        writeFileSync(reportPath, reportJson, 'utf8');
        writeFileSync(latestPath, reportJson, 'utf8');
        console.log(`✓ Benchmark report written to ${reportPath}`);
        console.log(`✓ Benchmark report written to ${latestPath}`);
    }

    console.log('\n--- Benchmark Summary ---');
    console.log(`Suite:                 ${report.suite}`);
    console.log(
        `Algorithm:             ${report.algorithm} v${report.algorithmVersion}`,
    );
    console.log(`Fixtures:              ${report.summary.totalFixtures}`);
    console.log(
        `Aggregate Median Time: ${report.summary.medianMsAggregate.toFixed(3)} ms`,
    );
    console.log(
        `Aggregate p95 Time:    ${report.summary.p95MsAggregate.toFixed(3)} ms`,
    );
    console.log(
        `Mean Reconstruction:   ${report.summary.reconstructionMeanAggregate.toFixed(3)} Lab`,
    );
    console.log(
        `Determinism:           ${report.summary.determinismAll ? 'PASS (100%)' : 'FAIL'}`,
    );
}

function resolveReportPath(reportPathArg) {
    if (reportPathArg) {
        return resolve(rootDir, reportPathArg);
    }
    const latestPath = resolve(rootDir, 'benchmarks/reports/latest.json');
    if (existsSync(latestPath)) {
        return latestPath;
    }
    const reportsDir = resolve(rootDir, 'benchmarks/reports');
    if (existsSync(reportsDir)) {
        const files = readdirSync(reportsDir)
            .filter((f) => f.startsWith('report-') && f.endsWith('.json'))
            .map((f) => ({
                path: resolve(reportsDir, f),
                mtime: statSync(resolve(reportsDir, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0 && files[0]) {
            return files[0].path;
        }
    }
    return latestPath;
}

function handleCompare(reportPathArg, baselinePathArg) {
    const reportPath = resolveReportPath(reportPathArg);
    const baselinePath = resolve(
        rootDir,
        baselinePathArg || 'benchmarks/baselines/lab-kmeans-v0.2.json',
    );

    if (!existsSync(baselinePath)) {
        console.error(`Baseline file not found at ${baselinePath}`);
        process.exit(1);
    }
    if (!existsSync(reportPath)) {
        console.error(`Report file not found at ${reportPath}`);
        process.exit(1);
    }

    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));

    console.log('=== BENCHMARK REGRESSION GATE COMPARISON ===');
    console.log(
        `Baseline: ${baseline.algorithm} (v${baseline.algorithmVersion}) - ${baseline.environment.nodeVersion} (${baseline.environment.cpu})`,
    );
    console.log(
        `Candidate: ${report.algorithm} (v${report.algorithmVersion}) - ${report.environment.nodeVersion} (${report.environment.cpu})\n`,
    );

    let failed = false;

    // 1. Corpus Checksum Gate
    if (
        !baseline.corpusChecksum ||
        !report.corpusChecksum ||
        baseline.corpusChecksum !== report.corpusChecksum
    ) {
        console.error(
            `❌ REGRESSION GATE FAILED: Corpus checksum missing or mismatch (candidate: ${report.corpusChecksum}, baseline: ${baseline.corpusChecksum}).`,
        );
        failed = true;
    } else {
        console.log(`✓ Corpus Checksum Gate: PASS (${report.corpusChecksum})`);
    }

    // 2. Protocol Checksum Gate
    const baseRuns =
        baseline.runnerOptions?.measuredRuns ??
        baseline.results?.[0]?.timing?.measuredRuns;
    const candRuns =
        report.runnerOptions?.measuredRuns ??
        report.results?.[0]?.timing?.measuredRuns;
    if (!baseRuns || !candRuns || baseRuns !== candRuns) {
        console.error(
            `❌ REGRESSION GATE FAILED: Measurement protocol missing or mismatch (candidate: ${candRuns} runs, baseline: ${baseRuns} runs).`,
        );
        failed = true;
    } else {
        console.log(`✓ Protocol Gate: PASS (${candRuns} measured runs)`);
    }

    // 3. Algorithm Match Gate
    if (
        !baseline.algorithm ||
        !report.algorithm ||
        baseline.algorithm !== report.algorithm ||
        !baseline.algorithmVersion ||
        !report.algorithmVersion ||
        baseline.algorithmVersion !== report.algorithmVersion
    ) {
        console.error(
            `❌ REGRESSION GATE FAILED: Algorithm or version mismatch (candidate: ${report.algorithm} v${report.algorithmVersion}, baseline: ${baseline.algorithm} v${baseline.algorithmVersion}).`,
        );
        failed = true;
    } else {
        console.log(
            `✓ Algorithm Gate: PASS (${report.algorithm} v${report.algorithmVersion})`,
        );
    }

    // 4. Determinism Gate
    if (!report.summary?.determinismAll) {
        console.error(
            '❌ REGRESSION GATE FAILED: Candidate failed determinism gate (not 100% deterministic).',
        );
        failed = true;
    } else {
        console.log('✓ Determinism Gate: PASS (100% deterministic)');
    }

    // 5. Aggregate Median Runtime Gate
    const baseMed = baseline.summary?.medianMsAggregate;
    const candMed = report.summary?.medianMsAggregate;
    if (baseMed === undefined || candMed === undefined) {
        console.error(
            '❌ REGRESSION GATE FAILED: Aggregate median runtime missing from report or baseline.',
        );
        failed = true;
    } else {
        const pctChange = ((candMed - baseMed) / baseMed) * 100;
        console.log(`\nAggregate Median Runtime:`);
        console.log(`  Baseline:  ${baseMed.toFixed(3)} ms`);
        console.log(`  Candidate: ${candMed.toFixed(3)} ms`);
        console.log(
            `  Change:    ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`,
        );

        if (pctChange > 20) {
            console.error(
                `❌ REGRESSION GATE FAILED: Aggregate median runtime regressed by ${pctChange.toFixed(2)}% (limit is +20%).`,
            );
            failed = true;
        } else {
            console.log(`✓ Aggregate Runtime Gate: PASS (within +20% limit).`);
        }
    }

    // 6. Per-Fixture Median Runtime Check (limit +35%, CV > 15% invalidates)
    console.log('\nPer-Fixture Runtime Check:');
    const baseFixtures = baseline.results || [];
    const candFixtures = report.results || [];
    if (
        baseFixtures.length === 0 ||
        candFixtures.length !== baseFixtures.length
    ) {
        console.error(
            `❌ REGRESSION GATE FAILED: Fixture set count mismatch (candidate: ${candFixtures.length} fixtures, baseline: ${baseFixtures.length} fixtures).`,
        );
        failed = true;
    }

    const candFixtureMap = new Map(candFixtures.map((r) => [r.fixtureId, r]));
    let invalidated = false;

    for (const baseRes of baseFixtures) {
        const candRes = candFixtureMap.get(baseRes.fixtureId);
        if (!candRes) {
            console.error(
                `  ❌ ${baseRes.fixtureId}: Missing from candidate report.`,
            );
            failed = true;
            continue;
        }

        const baseFixMed = baseRes.timing.medianMs;
        const candFixMed = candRes.timing.medianMs;
        const fixPctChange = ((candFixMed - baseFixMed) / baseFixMed) * 100;
        const candCv = candRes.timing.cv;
        const baseCv = baseRes.timing.cv;

        if (fixPctChange > 35) {
            if (candCv > 0.15 || baseCv > 0.15) {
                console.error(
                    `  ❌ ${candRes.fixtureId}: +${fixPctChange.toFixed(2)}% (exceeds +35% limit with high variance CV cand=${(candCv * 100).toFixed(1)}%, base=${(baseCv * 100).toFixed(1)}% > 15%). Performance comparison is invalidated and must be rerun.`,
                );
                invalidated = true;
            } else {
                console.error(
                    `  ❌ ${candRes.fixtureId}: +${fixPctChange.toFixed(2)}% (exceeds +35% limit with CV <= 15%)`,
                );
                failed = true;
            }
        } else {
            console.log(
                `  ✓ ${candRes.fixtureId}: ${fixPctChange >= 0 ? '+' : ''}${fixPctChange.toFixed(2)}%`,
            );
        }
    }

    if (invalidated) {
        console.error(
            '\n❌ BENCHMARK REGRESSION GATE INVALIDATED (high variance CV > 15% - benchmark execution must be rerun)',
        );
        process.exit(1);
    } else if (failed) {
        console.error('\n❌ BENCHMARK REGRESSION GATE FAILED');
        process.exit(1);
    } else {
        console.log('\n✓ BENCHMARK REGRESSION GATE PASSED CLEANLY');
    }
}

async function main() {
    const command = process.argv[2] || 'run';

    switch (command) {
        case 'corpus':
            await handleCorpus();
            break;
        case 'smoke':
            await handleRun(true, false);
            break;
        case 'run':
            await handleRun(false, false);
            break;
        case 'baseline':
            await handleRun(false, true);
            break;
        case 'compare':
            handleCompare(process.argv[3], process.argv[4]);
            break;
        default:
            console.error(`Unknown benchmark command: ${command}`);
            console.log(
                'Usage: node scripts/benchmark.mjs [corpus|smoke|run|baseline|compare]',
            );
            process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
