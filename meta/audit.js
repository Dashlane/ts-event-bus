const { exec } = require('child_process');

exec('yarn audit --summary', (error, stdout) => {
  console.log(stdout);
  if (error && error.code >= 8) {
    throw new Error('High severity vulnerabilities found');
  }
});
