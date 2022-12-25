const webpack = require('webpack');

module.exports = {
  mode: 'development',
  target: 'web',
  devtool: 'inline-source-map',
  stats: 'errors-only',
  module: {
    rules: [
      {
        test: /src\/.*\.tsx?$/,
        use: ['@jsdevtools/coverage-istanbul-loader'],
      },
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                ...require('./tsconfig.json'),
                module: 'ES6',
              },
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  optimization: {
    innerGraph: true,
    providedExports: true,
    usedExports: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env),
    }),
  ],
};
