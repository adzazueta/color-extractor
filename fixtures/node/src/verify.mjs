import { extractColors as extractRootColor } from '@adzazueta/color-extractor';
import {
    COLOR_EXTRACTOR_ERROR_CODES,
    ColorExtractorError,
    extractColors,
    VERSION,
} from '@adzazueta/color-extractor/node';
import sharp from 'sharp';

async function main() {
    const buffer = await sharp({
        create: {
            width: 10,
            height: 10,
            channels: 3,
            background: { r: 180, g: 0, b: 0 },
        },
    })
        .png()
        .toBuffer();

    const result = await extractColors(buffer, {
        algorithm: 'lab-kmeans',
        result: { maxColors: 1 },
    });

    if (result.metadata.algorithm !== 'lab-kmeans') {
        throw new Error(
            `expected algorithm 'lab-kmeans', got '${result.metadata.algorithm}'`,
        );
    }
    if (result.metadata.runtime !== 'node') {
        throw new Error(
            `expected runtime 'node', got '${result.metadata.runtime}'`,
        );
    }
    const rootResult = await extractRootColor(buffer, {
        algorithm: 'lab-kmeans',
        result: { maxColors: 1 },
    });
    if (rootResult.metadata.runtime !== 'node') {
        throw new Error('expected root runtime to be node');
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
        JSON.stringify({ status: 'ok', fixture: 'node', version: VERSION }),
    );
}

main().catch((e) => {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
});
