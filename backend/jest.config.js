module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/lambdas'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'lambdas/**/*.ts',
    '!lambdas/**/node_modules/**',
    '!**/node_modules/**',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  modulePathIgnorePatterns: ['<rootDir>/cdk.out/', '<rootDir>/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};
