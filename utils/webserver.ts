// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

import WebpackDevServer from 'webpack-dev-server';
import webpack, { Configuration } from 'webpack';
import config from '../webpack.config';
import env from './env';
import path from 'path';

const options = (config as any).chromeExtensionBoilerplate || {};
const excludeEntriesToHotReload = options.notHotReload || [];

for (const entryName of Object.keys((config as Configuration).entry || {})) { // Object.keysを使用
  if (excludeEntriesToHotReload.indexOf(entryName) === -1) {
    const entry = (config as Configuration).entry;
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      const currentEntry = entry[entryName];
      if (Array.isArray(currentEntry)) {
        currentEntry.unshift(
          'webpack/hot/dev-server',
          `webpack-dev-server/client?hot=true&hostname=localhost&port=${env.PORT}`
        );
      } else if (typeof currentEntry === 'string') {
        entry[entryName] = [
          'webpack/hot/dev-server',
          `webpack-dev-server/client?hot=true&hostname=localhost&port=${env.PORT}`,
          currentEntry,
        ];
      }
    }
  }
}

delete (config as any).chromeExtensionBoilerplate;

const compiler = webpack(config as Configuration);

const server = new WebpackDevServer(
  {
    https: false,
    hot: true,
    liveReload: false,
    client: {
      // webSocketTransport: 'sockjs', // sockjsは非推奨のため削除
    },
    // webSocketServer: 'sockjs', // sockjsは非推奨のため削除
    host: 'localhost',
    port: env.PORT,
    static: {
      directory: path.join(__dirname, '../build'),
    },
    devMiddleware: {
      publicPath: `http://localhost:${env.PORT}/`,
      writeToDisk: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    allowedHosts: 'all',
  },
  compiler
);

(async () => {
  await server.start();
})();
