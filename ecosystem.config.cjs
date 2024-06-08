module.exports = {
    apps: [{
      name: 'server',
      script: 'app.js',
      instances: 6, //max // Adjust the number of instances as needed
      exec_mode: 'cluster', // Enable cluster mode
      env: {
        PORT: 3000
      }
    }]
  };