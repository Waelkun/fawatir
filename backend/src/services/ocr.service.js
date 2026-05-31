const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const preprocessImage = async (inputPath) => {
  console.log(`Bypassing image preprocessing for: ${inputPath}`);
  return inputPath;
};

module.exports = {
  preprocessImage
};
