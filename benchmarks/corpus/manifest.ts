export type BenchmarkFixtureManifest = {
    readonly id: string;
    readonly source: 'generated' | 'rights-cleared';
    readonly license?: string;
    readonly category: string;
    readonly width: number;
    readonly height: number;
    readonly checksum: string;
    readonly notes?: string;
};

export type BenchmarkCorpusManifest = {
    readonly version: string;
    readonly generatedAt: string;
    readonly fixtures: readonly BenchmarkFixtureManifest[];
};

export type BenchmarkFixtureData = {
    readonly manifest: BenchmarkFixtureManifest;
    readonly pixels: {
        readonly data: Uint8Array;
        readonly width: number;
        readonly height: number;
        readonly channels: 4;
    };
};
