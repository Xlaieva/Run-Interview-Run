import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // `pyodide`'s ESM build (used only inside the browser Web Worker in
  // src/workers/run-python.worker.ts) has a Node.js compatibility branch
  // guarded by `if (!IN_NODE) return`, but it reaches those `node:*` built-ins
  // via dynamic `await import("node:fs")`-style calls with string-literal
  // specifiers. Webpack still eagerly tries to resolve those at build time
  // regardless of the runtime guard, and its client/webworker target doesn't
  // understand the `node:` URI scheme, so it fails the build (the dev server
  // uses classic webpack, not Turbopack — see AGENTS.md). `resolve.alias`
  // doesn't intercept this (scheme resolution happens before alias lookup),
  // so use IgnorePlugin to skip resolving them entirely on the client bundle.
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^node:/ }),
      );
    }
    return config;
  },
};

export default nextConfig;
