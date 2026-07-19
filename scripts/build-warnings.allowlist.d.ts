// Type declarations for build-warnings.allowlist.mjs
// Consumers (tests) import this module dynamically

interface BuildWarningAllowance {
    entrypoint: 'node' | 'browser' | 'core' | 'root';
    category: string;
    module: string;
    rationale: string;
}

export const ALLOWLIST: BuildWarningAllowance[];
