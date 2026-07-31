import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GH_PAGES is set by the deploy workflow so assets resolve under /Shopsmart/
export default defineConfig({
  base: process.env.GH_PAGES ? "/Shopsmart/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "ShopSmart",
        short_name: "ShopSmart",
        description: "Smart shopping lists, price comparison and trip planning",
        lang: "en",
        start_url: ".",
        scope: ".",
        theme_color: "#047857",
        background_color: "#fafaf9",
        display: "standalone",
        icons: [
          // PNGs carry safe-zone padding (scripts/make-icons.mjs), so they are
          // safe to crop; the SVG has none and must not be marked maskable.
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
        ]
      }
    })
  ]
});
