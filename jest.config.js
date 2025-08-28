/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '**/*.unit.test.ts',
    '**/*.integration.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
      isolatedModules: true,
    },
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: false,
};
