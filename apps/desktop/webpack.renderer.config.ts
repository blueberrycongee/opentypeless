import type { Configuration } from 'webpack';

import { plugins } from './webpack.plugins';
import { rules } from './webpack.rules';

const rendererRules = [
  ...rules,
  {
    test: /\.css$/,
    use: [{ loader: 'style-loader' }, { loader: 'css-loader' }]
  }
];

export const rendererConfig: Configuration = {
  module: {
    rules: rendererRules
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.css'],
    alias: {
      '@renderer': __dirname + '/src/renderer',
      '@shared': __dirname + '/src/shared'
    }
  }
};
