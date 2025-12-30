module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts?(x)'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  }
};