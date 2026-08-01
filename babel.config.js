// Mesmo preset que o Metro já aplica por default no Expo — existe explicitamente
// porque o babel-jest (usado pelo `npm test`) precisa de um arquivo de config.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
