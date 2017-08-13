module.exports = {
  apps : [{
    name        : "pdf-bot",
    script      : "pdf-bot",
    args        : "api -c ./pdf-bot.config.js",
    // Should be from whatever folder your pdf-bot.config.js is in
    // cwd         : "/home/[user]/",
    env: {
        "DEBUG"   : "pdf:*",
        "NODE_ENV": "production",
    },
  }]
}
