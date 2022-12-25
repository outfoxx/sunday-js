module.exports = function (config) {
  config.set({
    frameworks: ['jasmine', 'webpack'],

    basePath: '',

    files: ['src/**/*.ts', 'test/**/*.ts'],

    preprocessors: {
      '**/*.ts': ['webpack', 'sourcemap'],
    },

    reporters: ['spec', 'coverage-istanbul', 'sonarqubeUnit'],

    webpack: require('./webpack-esnext.config.js'),

    coverageIstanbulReporter: {
      reports: ['lcov'],
      dir: 'reports/coverage',
      'report-config': {
        lcov: { subdir: '.' },
      },
    },

    sonarQubeUnitReporter: {
      sonarQubeVersion: 'LATEST',
      outputFile: 'reports/test-report.xml',
      testPaths: ['./test'],
      testFilePattern: '.test.ts',
      overrideTestDescription: true,
      useBrowserName: false,
    },

    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeHeadless'],
    singleRun: false,
    concurrency: Infinity,
  });
};
