module.exports = {
  apps: [{
    name: 'pdf-bot',
    script: 'bin/pdf-bot.js',
    args: '-c examples/pdf-bot.config.js start --concurrency=2',
    instances : "max",
    exec_mode : "cluster"
  }]
}
