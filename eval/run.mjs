// Runs the evaluation (eval/cli.ts) through Vite's module runner, so TypeScript and the @/ alias work.
// Usage: vp run eval [options]   (see vp run eval --help)
import { fileURLToPath } from "node:url";
import { createServer, isRunnableDevEnvironment } from "vite-plus";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({
  configFile: false, // not the repository config: no test plugins, no lab plugin
  root,
  logLevel: "warn",
  appType: "custom",
  resolve: { tsconfigPaths: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const environment = server.environments.ssr;
  if (!isRunnableDevEnvironment(environment)) {
    throw new Error("The SSR environment cannot run modules.");
  }
  const cli = await environment.runner.import(fileURLToPath(new URL("./cli.ts", import.meta.url)));
  process.exitCode = await cli.main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await server.close();
}
