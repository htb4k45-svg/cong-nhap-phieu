/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // 7zip-bin và pdf-parse có native binary — không bundle, dùng require() thông thường
  serverExternalPackages: ['7zip-bin', 'pdf-parse'],
  // Bảo Vercel đưa binary của 7zip-bin vào bundle serverless function
  outputFileTracingIncludes: {
    '/api/nhien-lieu/unrar': ['./node_modules/7zip-bin/**/*'],
  },
};

export default nextConfig;
