// Converts icon.svg → icon-192.png and icon-512.png using sharp
// Run: node scripts/gen-icons.js

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const publicDir = path.resolve(__dirname, "../ui/public");
const svgPath = path.join(publicDir, "icon.svg");
const svg = fs.readFileSync(svgPath);

const sizes = [192, 512];

(async () => {
    for (const size of sizes) {
        const out = path.join(publicDir, `icon-${size}.png`);
        await sharp(svg)
            .resize(size, size)
            .png()
            .toFile(out);
        console.log(`✓ ${out}`);
    }
    console.log("Icons generated!");
})();
