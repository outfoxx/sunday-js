// Karma configuration
// Generated on Thu Sep 24 2020 06:46:47 GMT-0700 (Mountain Standard Time)

module.exports = function (config) {
  config.set({
    frameworks: ['jasmine', 'karma-typescript', 'source-map-support'],

    basePath: '',
    files: ['test/matchers.ts', 'test/**/*.ts', 'src/**/*.ts'],

    preprocessors: {
      '**/*.ts': ['karma-typescript', 'sourcemap'],
      '**/*.js': ['sourcemap'],
      'src/**/*.ts': ['coverage'],
    },

    karmaTypescriptConfig: {
      tsconfig: './tsconfig.json',
      compilerOptions: {
        module: 'commonjs',
      },
      coverageOptions: {
        instrumentation: false,
      },
      bundlerOptions: {
        sourceMap: true,
        exclude: ['@outfoxx/jackson-js/dist/@types'],
        transforms: [
          require('karma-typescript-es6-transform')({
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: {
                    chrome: '80',
                  },
                },
              ],
            ],
          }),
        ],
      },
    },

    reporters: ['progress', 'coverage'],

    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeHeadless'],
    singleRun: false,
    concurrency: Infinity,
  });
};
