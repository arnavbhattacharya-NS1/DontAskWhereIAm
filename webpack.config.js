const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const pages = ['settings', 'wizard', 'board-picker', 'row-picker'];

module.exports = pages.map((page) => ({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: path.resolve(__dirname, `src/renderer/${page}/index.tsx`),
  target: 'electron-renderer',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  output: {
    filename: `${page}.js`,
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, `src/renderer/${page}/index.html`),
      filename: `${page}.html`,
    }),
  ],
}));
