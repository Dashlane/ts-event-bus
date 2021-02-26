module.exports = {
  plugins: [
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
  presets: [
    [
      '@babel/preset-env',
      {
        bugfixes: true,
        useBuiltIns: false,
        modules: 'commonjs',
      },
    ],
    '@babel/preset-typescript',
  ],
};
