import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

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
        warmupRuns: 5,
        measuredRuns: isSmoke ? 5 : 20,
    };

    const report = await runBenchmarkSuite(corpus, runnerOptions);

    if (isBaseline) {
        const baselinePath = resolve(
            rootDir,
            'benchmarks/baselines/lab-kmeans-v0.2.json',
        );
        mkdirSync(dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`✓ Checked-in baseline written to ${baselinePath}`);
    } else {
        const reportsDir = resolve(rootDir, 'benchmarks/reports');
        mkdirSync(reportsDir, { recursive: true });
        const timeStr = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = resolve(reportsDir, `report-${timeStr}.json`);
        writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`✓ Benchmark report written to ${reportPath}`);
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

function handleCompare(reportPathArg, baselinePathArg) {
    const reportPath = resolve(
        rootDir,
        reportPathArg || 'benchmarks/reports/latest.json',
    );
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
        `Baseline: ${baseline.algorithm} (v${baseline.algorithmVersion}) - ${baseline.environment.nodeVersion}`,
    );
    console.log(
        `Candidate: ${report.algorithm} (v${report.algorithmVersion}) - ${report.environment.nodeVersion}\n`,
    );

    const baseMed = baseline.summary.medianMsAggregate;
    const candMed = report.summary.medianMsAggregate;
    const pctChange = ((candMed - baseMed) / baseMed) * 100;

    console.log(`Aggregate Median Runtime:`);
    console.log(`  Baseline:  ${baseMed.toFixed(3)} ms`);
    console.log(`  Candidate: ${candMed.toFixed(3)} ms`);
    console.log(
        `  Change:    ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%\n`,
    );

    if (pctChange > 20) {
        console.error(
            `❌ REGRESSION GATE FAILED: Aggregate median runtime regressed by ${pctChange.toFixed(2)}% (limit is +20%).`,
        );
        process.exit(1);
    } else {
        console.log(
            `✓ REGRESSION GATE PASSED: Runtime change is within acceptable bounds (+20% limit).`,
        );
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
