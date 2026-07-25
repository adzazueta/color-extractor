import fs from 'node:fs';

const targetVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(targetVersion ?? '')) {
    throw new Error(`expected a stable semver version, got ${targetVersion}`);
}

const packagePath = new URL('../package.json', import.meta.url);
const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version;

if (currentVersion === targetVersion) {
    process.exit(0);
}

const currentHeading = `## ${currentVersion}`;
const changelog = fs.readFileSync(changelogPath, 'utf8');
if (!changelog.includes(`${currentHeading}\n`)) {
    throw new Error(
        `cannot retarget changelog: missing heading for ${currentVersion}`,
    );
}

packageJson.version = targetVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`);
fs.writeFileSync(
    changelogPath,
    changelog.replace(`${currentHeading}\n`, `## ${targetVersion}\n`),
);
