// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

var webpack = require('webpack'),
  path = require('path'),
  fs = require('fs'),
  config = require('../webpack.config');

delete config.chromeExtensionBoilerplate;

config.mode = 'production';

var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

webpack(config, function (err, stats) {
  if (err) {
    console.error('Webpack エラー: ', err.stack || err);
    if (err.details) {
      console.error('Webpack エラー詳細: ', err.details);
    }
    return;
  }

  const info = stats.toJson({
    hash: true, // Show the hash of the compilation
    version: true, // Show the webpack version used in the compilation
    timings: true, // Show timing information for individual modules
    assets: true, // Show list of assets in the compilation
    chunks: true, // Show list of chunks in the compilation
    modules: true, // Show list of modules in the compilation
    reasons: true, // Show reasons why modules are included in the compilation
    children: true, // Show stats for child compilations
    source: false, // Exclude sources of modules
    errors: true, // Show errors
    errorDetails: true, // Show details of errors
    warnings: true, // Show warnings
    publicPath: true, // Show the public path
  });

  if (stats.hasErrors()) {
    console.error('ビルドエラー:');
    info.errors.forEach(error => console.error(error.message));
  }

  if (stats.hasWarnings()) {
    console.warn('ビルド警告:');
    info.warnings.forEach(warning => console.warn(warning.message));
  }

  console.log('ビルド成功！');
  console.log(stats.toString({
    colors: true,
    hash: false,
    version: false,
    timings: false,
    assets: true,
    chunks: false,
    modules: false,
    reasons: false,
    children: false,
    source: false,
    errors: true,
    errorDetails: true,
    warnings: true,
    publicPath: false,
  }));
});
