/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse -> pdfjs-dist(legacy build)가 webpack의 서버 번들링과 충돌해
  // "TypeError: Object.defineProperty called on non-object"로 깨짐 — 네이티브 require로 우회.
  // Next.js 14.2.29는 아직 stable 최상위 serverExternalPackages 키를 인식하지 못해 experimental 키를 쓴다.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
};

export default nextConfig;
