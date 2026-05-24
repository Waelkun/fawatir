const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Enhances image quality for OCR processing (reduces blur, improves contrast, grayscales, sharpens text)
 * @param {string} inputPath - Path of the original image
 * @returns {Promise<string>} - Path of the processed enhanced image
 */
const preprocessImage = async (inputPath) => {
  try {
    const ext = path.extname(inputPath);
    const directory = path.dirname(inputPath);
    const filename = path.basename(inputPath, ext);
    const outputPath = path.join(directory, `enhanced_${filename}.jpeg`); // Save as standard JPEG

    // Don't preprocess PDFs, let Gemini parse directly
    if (ext.toLowerCase() === '.pdf') {
      return inputPath;
    }

    console.log(`Starting image preprocessing for: ${filename}`);

    // Preprocessing Pipeline:
    // 1. Grayscale: removes color noise
    // 2. Normalize: stretches contrast to cover full dynamic range (improves lighting)
    // 3. Sharpen: makes text edges cleaner
    // 4. Resize: resize to reasonable max width (e.g. 1800px) keeping aspect ratio for fast uploading
    await sharp(inputPath)
      .resize({ width: 1800, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1, m1: 0.5, m2: 10 })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    console.log(`Preprocessing complete. Enhanced image saved at: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error in image preprocessing, using original file:", error);
    return inputPath; // Fallback to original path in case of sharp failure
  }
};

module.exports = {
  preprocessImage
};
