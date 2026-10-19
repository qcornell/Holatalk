const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add .bin to asset extensions so ggml-tiny.bin can be bundled via require()
config.resolver.assetExts.push('bin');

module.exports = config;
