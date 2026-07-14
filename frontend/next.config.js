/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exported to plain files and served by the FastAPI backend, so there is no
  // Node process at runtime.
  output: 'export',
  // Emits `login/index.html` rather than `login.html`, which is what
  // Starlette's StaticFiles(html=True) resolves for a `/login` request.
  trailingSlash: true,
};

module.exports = nextConfig;
