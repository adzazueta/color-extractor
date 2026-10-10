import { join, sep } from "node:path";
import { isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite-plus";
import { resolveEvalDir } from "../../eval/lib/locate.js";
import { createLabHandler, type Analyzer } from "./handler.js";

export interface LabPluginOptions {
  /** Default: `resolveEvalDir(root)`, which honors COLOR_EXTRACTOR_EVAL_DIR. */
  readonly evalDir?: string;
}

/** `server.host` values that keep the dev server on this machine. */
const LOCAL_HOSTS: readonly (string | boolean | undefined)[] = [
  undefined,
  "localhost",
  "127.0.0.1",
  "::1",
];

/** Folders whose edits can change the decoder or the analysis. */
const WATCHED_FOLDERS: readonly string[] = ["src", join("eval", "lib")];

/**
 * The evaluation lab (`vp dev` only): serves the API of `lab/api.ts` and redirects `/` to `/lab/`.
 * Never applied by Vitest (mode `test`), builds, or `vp pack`.
 */
export function lab(options?: LabPluginOptions): Plugin {
  return {
    name: "color-extractor-lab",
    apply: (_config, env) => env.command === "serve" && env.mode !== "test",
    configureServer(server: ViteDevServer) {
      if (!LOCAL_HOSTS.includes(server.config.server.host)) {
        throw new Error("The lab only listens on localhost. Remove --host or server.host.");
      }
      const root = server.config.root;
      const evalDir = options?.evalDir ?? resolveEvalDir(root);

      const loadAnalyzer = async (): Promise<Analyzer> => {
        const environment = server.environments.ssr;
        if (!isRunnableDevEnvironment(environment)) {
          throw new Error("The SSR environment cannot run modules.");
        }
        // The runner caches the module and evaluates it again after an edit to src/ or eval/lib/.
        return environment.runner.import<Analyzer>(join(root, "eval/lib/analyze.ts"));
      };

      const handler = createLabHandler({ root, evalDir, loadAnalyzer });
      server.middlewares.use(handler);

      const folders = WATCHED_FOLDERS.map((folder) => join(root, folder) + sep);
      server.watcher.on("all", (_event: string, file: string) => {
        if (folders.some((folder) => file.startsWith(folder))) handler.invalidate();
      });
      server.httpServer?.once("close", () => handler.close());
    },
  };
}
