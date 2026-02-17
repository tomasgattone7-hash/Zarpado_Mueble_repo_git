import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = process.cwd();
const assetsDir = path.resolve(rootDir, '..', 'frontend', 'assets');
const outputDir = path.resolve(assetsDir, 'optimized');

const PRODUCT_SOURCES = [
    'desk_gamer.png',
    'tv_rack.png',
    'coffee_table.png',
    'library.png',
    'sideboard.png',
    'office_desk.png',
    'cabinet.webp',
    'chair.webp',
    'table.webp',
    'tv_unit.webp',
    'melamine_desk.webp'
];

const HERO_SOURCES = [
    'principal.webp',
    '12.webp',
    '13.webp',
    '14.webp',
    '15.webp',
    '16.webp',
    '17.webp',
    '18.webp',
    '19.webp',
    'nosotros.webp'
];

const FORMATS = [
    { ext: 'webp', options: { quality: 78, effort: 5 } },
    { ext: 'avif', options: { quality: 52, effort: 5 } }
];

async function ensureDirectory(directoryPath) {
    await fs.mkdir(directoryPath, { recursive: true });
}

async function generateSet(sourceFileName, widths) {
    const sourcePath = path.resolve(assetsDir, sourceFileName);
    const image = sharp(sourcePath, { failOnError: false }).rotate();
    const metadata = await image.metadata();
    const maxWidth = metadata.width || 0;
    const fileBase = sourceFileName.replace(/\.[a-z0-9]+$/i, '');

    for (const width of widths) {
        const targetWidth = Math.min(width, maxWidth || width);

        for (const format of FORMATS) {
            const outputPath = path.resolve(outputDir, `${fileBase}-${targetWidth}.${format.ext}`);
            await image
                .clone()
                .resize({ width: targetWidth, withoutEnlargement: true })
                [format.ext](format.options)
                .toFile(outputPath);
        }
    }
}

async function main() {
    await ensureDirectory(outputDir);

    for (const fileName of PRODUCT_SOURCES) {
        await generateSet(fileName, [360, 640, 960]);
    }

    for (const fileName of HERO_SOURCES) {
        await generateSet(fileName, [640, 960, 1280, 1600]);
    }

    console.log('Responsive image sets generated in frontend/assets/optimized');
}

main().catch((error) => {
    console.error('Failed to generate responsive images:', error);
    process.exit(1);
});
