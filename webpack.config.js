const path = require('path')

module.exports = {
    mode: "production",
    entry: {
        'index': ['./src/index.ts']
    },
    module: {
        rules: [{
            test: /\.ts$/,
            use: [
                'babel-loader',
                'ts-loader'
            ]
        }]
    },
    output: {
        filename: '[name].js',
        libraryTarget: 'commonjs2',
        path: path.join(__dirname, './build'),
    },
    externals: ['ws'],
    target: 'web',
    resolve: {
    extensions: ['.json', '.js', '.ts'],
    modules: ['node_modules', 'src'],
    },
}
