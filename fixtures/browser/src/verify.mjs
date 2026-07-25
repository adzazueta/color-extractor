globalThis.ImageData = class {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
};

const {
    extractColor,
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
    const result = await extractColor(input, {
        algorithm: 'lab-kmeans',
        result: { maxColors: 1 },
    });

    if (result.metadata.algorithm !== 'lab-kmeans') {
        throw new Error(
            `expected algorithm 'lab-kmeans', got '${result.metadata.algorithm}'`,
        );
    }
    if (result.metadata.decoder !== 'image-data') {
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
