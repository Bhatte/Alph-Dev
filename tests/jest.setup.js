// Jest setup file to configure test environment
// This ensures NODE_ENV is set to 'test' for SafeEditManager assertions

process.env.NODE_ENV = 'test';

// Increase max listeners to avoid warnings during parallel tests
if (process.setMaxListeners) {
  process.setMaxListeners(20);
}
