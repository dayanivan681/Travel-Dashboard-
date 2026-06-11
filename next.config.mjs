// Static export so the app can be hosted anywhere (GitHub Pages, Netlify,
// any static host). NEXT_PUBLIC_BASE_PATH is set in CI when deploying under a
// subpath (e.g. https://<user>.github.io/<repo>/).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // The Anthropic SDK guards its Node-only code paths at runtime (we run it
  // in the browser with dangerouslyAllowBrowser), but webpack still needs the
  // Node builtins it references stubbed out of the client bundle.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // "node:path"-style scheme imports skip resolve.fallback — strip the
      // prefix first so the fallbacks below apply.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        child_process: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
