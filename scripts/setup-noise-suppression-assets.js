#!/usr/bin/env node

/**
 * Setup script to download DeepFilterNet3 assets for local bundling.
 * This downloads the WASM binary and AI model from Mezon's CDN
 * and places them in public/assets/deepfilternet3/ for bundling.
 *
 * Usage:
 *   node scripts/setup-noise-suppression-assets.js
 *
 * Environment variables:
 *   DEEPFILTERNET3_CDN_URL: Override the default CDN URL (optional)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

const CDN_URL =
  process.env.DEEPFILTERNET3_CDN_URL ||
  "https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3";

const ASSETS_DIR = path.join(projectRoot, "public", "assets", "deepfilternet3");
const V2_DIR = path.join(ASSETS_DIR, "v2");
const PKG_DIR = path.join(V2_DIR, "pkg");
const MODELS_DIR = path.join(V2_DIR, "models");

const FILES_TO_DOWNLOAD = [
  {
    url: `${CDN_URL}/v2/pkg/df_bg.wasm`,
    path: path.join(PKG_DIR, "df_bg.wasm"),
    description: "WASM binary",
  },
  {
    url: `${CDN_URL}/v2/pkg/df_bg.wasm.d.ts`,
    path: path.join(PKG_DIR, "df_bg.wasm.d.ts"),
    description: "WASM TypeScript definitions",
    optional: true,
  },
  {
    url: `${CDN_URL}/v2/models/DeepFilterNet3_onnx.tar.gz`,
    path: path.join(MODELS_DIR, "DeepFilterNet3_onnx.tar.gz"),
    description: "AI Model (ONNX format)",
  },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
}

function downloadFile(fileUrl, filePath, isOptional = false) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);

    // Skip if already exists
    if (fs.existsSync(filePath)) {
      console.log(`✓ Already exists: ${fileName}`);
      resolve();
      return;
    }

    console.log(`⏳ Downloading ${fileName}...`);

    https
      .get(fileUrl, (response) => {
        // Handle redirects
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 307
        ) {
          const redirectUrl = response.headers.location;
          console.log(`  Redirected to: ${redirectUrl}`);
          downloadFile(redirectUrl, filePath, isOptional)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          const error = new Error(
            `Download failed: HTTP ${response.statusCode} for ${fileName}`,
          );
          if (isOptional) {
            console.warn(`⚠ Optional file skipped: ${fileName}`);
            resolve();
          } else {
            reject(error);
          }
          return;
        }

        const fileStream = fs.createWriteStream(filePath);

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
          console.log(`✓ Downloaded: ${fileName} (${sizeMB} MB)`);
          resolve();
        });

        fileStream.on("error", (err) => {
          fs.unlink(filePath, () => {}); // Clean up partial file
          reject(err);
        });
      })
      .on("error", (err) => {
        if (isOptional) {
          console.warn(`⚠ Optional file skipped: ${fileName} (${err.message})`);
          resolve();
        } else {
          reject(err);
        }
      });
  });
}

async function main() {
  try {
    console.log("\n🚀 Setting up DeepFilterNet3 assets for bundling...\n");
    console.log(`📦 CDN URL: ${CDN_URL}`);
    console.log(`📁 Asset directory: ${ASSETS_DIR}\n`);

    // Ensure directories exist
    ensureDir(ASSETS_DIR);
    ensureDir(V2_DIR);
    ensureDir(PKG_DIR);
    ensureDir(MODELS_DIR);

    // Download files
    for (const file of FILES_TO_DOWNLOAD) {
      await downloadFile(file.url, file.path, file.optional);
    }

    console.log("\n✅ Asset setup complete!");
    console.log(
      "\nAssets are ready for bundling. Next build will include them.\n",
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Asset setup failed:", error.message);
    process.exit(1);
  }
}

main();
