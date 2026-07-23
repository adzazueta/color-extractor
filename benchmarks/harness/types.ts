export type BenchmarkEnvironment = {
    readonly nodeVersion: string;
    readonly os: string;
    readonly cpu: string;
    readonly cores: number;
    readonly timestamp: string;
    readonly packageVersion: string;
    readonly gitCommit: string;
};

export type BenchmarkTimingStats = {
    readonly minMs: number;
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
    readonly meanMs: number;
    readonly cv: number;
    readonly warmupRuns: number;
    readonly measuredRuns: number;
};

export type BenchmarkQualityMetrics = {
    readonly reconstructionMean: number;
    readonly reconstructionP95: number;
    readonly diversityMin: number | null;
    readonly diversityMean: number | null;
    readonly coverage: number;
    readonly maxProportion: number;
    readonly entropy: number;
    readonly determinism: boolean;
};

export type BenchmarkFixtureResult = {
    readonly fixtureId: string;
    readonly category: string;
    readonly width: number;
    readonly height: number;
    readonly validPixels: number;
    readonly algorithm: string;
    readonly algorithmVersion: string;
    readonly timing: BenchmarkTimingStats;
    readonly quality: BenchmarkQualityMetrics;
    readonly candidateCount: number;
    readonly returnedColors: number;
    readonly algorithmDetails: Readonly<Record<string, unknown>>;
};

export type BenchmarkReportSummary = {
    readonly totalFixtures: number;
    readonly medianMsAggregate: number;
    readonly p95MsAggregate: number;
    readonly reconstructionMeanAggregate: number;
    readonly diversityMeanAggregate: number | null;
    readonly determinismAll: boolean;
};

export type BenchmarkRunnerOptionsSummary = {
    readonly warmupRuns: number;
    readonly measuredRuns: number;
};

export type BenchmarkReport = {
    readonly suite: 'core' | 'node-decode' | 'browser';
    readonly environment: BenchmarkEnvironment;
    readonly algorithm: string;
    readonly algorithmVersion: string;
    readonly options: Readonly<Record<string, unknown>>;
    readonly runnerOptions: BenchmarkRunnerOptionsSummary;
    readonly corpusChecksum: string;
    readonly summary: BenchmarkReportSummary;
    readonly results: readonly BenchmarkFixtureResult[];
};
