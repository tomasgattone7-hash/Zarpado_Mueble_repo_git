import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const assetsDir = path.resolve(process.cwd(), 'assets');
const minSizeBytes = 250 * 1024;
const quality = 78;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

async function optimizeImages() {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    const manifest = {};
    let converted = 0;

    for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        const inputPath = path.join(assetsDir, entry.name);
        const outputPath = path.join(assetsDir, `${path.basename(entry.name, ext)}.webp`);
        const stat = await fs.stat(inputPath);

        if (stat.size < minSizeBytes) continue;

        const image = sharp(inputPath, { failOnError: false });
        const metadata = await image.metadata();

        await image
            .rotate()
            .webp({ quality, effort: 5 })
            .toFile(outputPath);

        const outputStat = await fs.stat(outputPath);
        const reduction = ((1 - outputStat.size / stat.size) * 100).toFixed(1);

        manifest[entry.name] = {
            width: metadata.width || null,
            height: metadata.height || null,
            original_bytes: stat.size,
            optimized_webp: path.basename(outputPath),
            optimized_bytes: outputStat.size,
            saved_percent: Number(reduction)
        };

        converted += 1;
        console.log(
            `${entry.name} -> ${path.basename(outputPath)} (${(stat.size / 1024).toFixed(1)} KB -> ${(outputStat.size / 1024).toFixed(1)} KB, -${reduction}%)`
        );
    }

    const manifestPath = path.join(assetsDir, 'image-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nConversiones realizadas: ${converted}`);
    console.log(`Manifest generado: ${manifestPath}`);
}

optimizeImages().catch((error) => {
    console.error('Error optimizando imagenes:', error);
    process.exit(1);
});
