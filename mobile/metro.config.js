const { getDefaultConfig } = require('expo/metro-config');

/** Standard Metro config (Expo Router + web export). */
const config = getDefaultConfig(__dirname);

module.exports = config;
