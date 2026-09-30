/**
 * Adds build settings to app.json that depend on the build environment.
 * A release build pointed at a plain-http API (a computer on the local network, for testing on a
 * phone) must be allowed to use cleartext traffic; builds with an https API keep it disabled.
 */
module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL ?? "";
  if (!api.startsWith("http://")) return config;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ["expo-build-properties", { android: { usesCleartextTraffic: true } }]],
  };
};
