globalThis.ImageData = class {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
};

const {
    extractColors,
    extractPalette,
    VERSION,
    ColorExtractorError,
    COLOR_EXTRACTOR_ERROR_CODES,
} = await import('@adzazueta/color-extractor/browser');

async function main() {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 200;
        data[i + 1] = 20;
        data[i + 2] = 20;
        data[i + 3] = 255;
    }

    const input = new globalThis.ImageData(data, 20, 20);
    const result = await extractColors(input, {
        output: { includeMetadata: true },
    });

    if (!result.metadata) throw new Error('metadata is undefined');

    const palette = await extractPalette(input, {
        algorithm: 'lab-kmeans',
        result: { maxColors: 1 },
    });
    if (palette.metadata.algorithm !== 'lab-kmeans') {
        throw new Error(
            `expected algorithm 'lab-kmeans', got '${palette.metadata.algorithm}'`,
        );
    }
    if (palette.metadata.decoder !== 'image-data') {
        throw new Error('expected image-data palette decoder');
    }
    if (result.metadata.runtime !== 'browser') {
        throw new Error(
            `expected runtime 'browser', got '${result.metadata.runtime}'`,
        );
    }
    if (!result.metadata.packageVersion)
        throw new Error('missing packageVersion');
    if (VERSION !== result.metadata.packageVersion) {
        throw new Error(
            `VERSION mismatch: ${VERSION} vs ${result.metadata.packageVersion}`,
        );
    }
    if (typeof ColorExtractorError !== 'function')
        throw new Error('ColorExtractorError not imported');
    if (!Array.isArray(COLOR_EXTRACTOR_ERROR_CODES))
        throw new Error('COLOR_EXTRACTOR_ERROR_CODES not imported');

    console.log(
        JSON.stringify({ status: 'ok', fixture: 'browser', version: VERSION }),
    );
}

main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
});
