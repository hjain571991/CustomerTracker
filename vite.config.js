import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative asset URLs, so the same `dist/` works at a domain root (Vercel,
  // Netlify) and under a sub-path (GitHub Pages) with no rebuild.
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "data/customers.csv", "data/reminders.csv"],
      manifest: {
        name: "Customer Visit Tracker",
        short_name: "Visit Tracker",
        description: "Tap when a customer walks in. See who's overdue a visit.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0E0F11",
        theme_color: "#0E0F11",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,csv,ico}"],
        // The spreadsheet library is ~430 kB and only needed if someone imports
        // an .xlsx. Precaching it would make every install pay for it, so it is
        // fetched on demand and cached from then on (rule below).
        globIgnores: ["**/xlsx-*.js"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\/assets\/xlsx-[\w-]+\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "xlsx-chunk",
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fonts must survive going offline in the shop.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
