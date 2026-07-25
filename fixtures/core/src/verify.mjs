import {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    extractColorFromPixels,
    VERSION,
} from '@adzazueta/color-extractor/core';

async function main() {
    const data = new Uint8Array(20 * 20 * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 200;
        data[i + 1] = 20;
        data[i + 2] = 20;
        data[i + 3] = 255;
    }

    const result = await extractColorFromPixels(
        { data, width: 20, height: 20, channels: 4 },
        { algorithm: 'lab-kmeans', result: { maxColors: 1 } },
    );

    if (result.metadata.algorithm !== 'lab-kmeans') {
        throw new Error(
            `expected algorithm 'lab-kmeans', got '${result.metadata.algorithm}'`,
        );
    }
    if (result.metadata.decoder !== 'pixels') {
        throw new Error('expected pixels palette decoder');
    }
    if (result.metadata.runtime !== 'core') {
        throw new Error(
            `expected runtime 'core', got '${result.metadata.runtime}'`,
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
        JSON.stringify({ status: 'ok', fixture: 'core', version: VERSION }),
    );
}

main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
});
