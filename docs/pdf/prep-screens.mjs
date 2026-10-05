// Turns the browser screenshots in docs/screens into small JPEG files for the PDF (assets/app/).
// Run: node prep-screens.mjs   (the PDF build itself never needs the originals)
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const screens = path.resolve(here, '..', 'screens');
const outDir = path.join(here, 'assets', 'app');
const QUALITY = 80;

const DESKTOP = [
  ['landing-hero-dark', 'public/landing-hero-1440x900-dark.png'],
  ['landing-why-light', 'public/landing-why-leafy-1440x900-light.png'],
  ['handbook-index-dark', 'public/handbook-index-1440x900-dark.png'],
  ['plant-tomato-light', 'public/plant-tomato-overview-1440x900-light.png'],
  ['disease-overview-dark', 'public/disease-tomato-ylcv-overview-1440x900-dark.png'],
  ['disease-treatment-light', 'public/disease-early-blight-treatment-1440x900-light.png'],
  ['disease-causes-dark', 'public/disease-tomato-ylcv-causes-1440x900-dark.png'],
  ['disease-symptoms-light', 'public/disease-tomato-ylcv-symptoms-1440x900-light.png'],
  ['disease-prevention-dark', 'public/disease-tomato-ylcv-prevention-1440x900-dark.png'],
  ['disease-images-light', 'public/disease-tomato-ylcv-images-1440x900-light.png'],
  ['login-dark', 'auth-extras/login-desktop-dark.png'],
  ['register-light', 'auth-extras/register-desktop-light.png'],
  ['dashboard-dark', 'member/dashboard-desktop-dark.png'],
  ['dashboard-light', 'member/dashboard-desktop-light.png'],
  ['scan-idle-dark', 'scan/scan-idle-desktop-dark.png'],
  ['scan-preview-light', 'scan/scan-preview-desktop-light.png'],
  ['scan-progress-dark', 'scan/scan-progress-desktop-dark.png'],
  ['result-dark', 'scan/result-result-desktop-dark.png'],
  ['history-rail-dark', 'scan/history-rail-desktop-dark.png'],
  ['account-profile-light', 'member/account-profile-desktop-light.png'],
  ['outcome-healthy-dark', 'scan/outcome-healthy-desktop-dark.png'],
  ['outcome-unknown-light', 'scan/outcome-unknown-desktop-light.png'],
  ['outcome-failed-dark', 'scan/outcome-failed-desktop-dark.png'],
];
const PHONE = [
  ['phone-landing-dark', 'public/landing-hero-390x844-dark.png'],
  ['phone-handbook-dark', 'public/handbook-index-390x844-dark.png'],
  ['phone-progress-dark', 'scan/scan-progress-phone-dark.png'],
  ['phone-result-dark', 'scan/result-result-phone-dark.png'],
  ['phone-scan-light', 'scan/scan-idle-phone-light.png'],
  ['phone-healthy-light', 'scan/outcome-healthy-phone-light.png'],
  ['phone-dashboard-light', 'member/dashboard-phone-light.png'],
  ['phone-account-light', 'member/account-profile-phone-light.png'],
];

fs.mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [name, rel] of [...DESKTOP, ...PHONE]) {
  const img = await loadImage(path.join(screens, rel));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  const buf = canvas.toBuffer('image/jpeg', QUALITY);
  fs.writeFileSync(path.join(outDir, `${name}.jpg`), buf);
  total += buf.length;
}
console.log(`wrote ${DESKTOP.length + PHONE.length} files, ${(total / 1024).toFixed(0)} KB`);
