# Running pdf-bot in production

## Run pdf-bot using pm2

It is recommended to use [pm2](https://github.com/Unitech/pm2) to run a pdf-bot process.

First install `pm2`

```
npm install -g pm2
```

[Create a configuration file using the one in this repo as an example](https://github.com/esbenp/pdf-bot/blob/master/production/pm2.config.js)

`pdf-bot-process.config.js`
```javascript
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
```

Run in using `pm2 start pdf-bot-process.config.js`

[Read more about starting the app on server restarts](http://pm2.keymetrics.io/docs/usage/startup/)

## Use nginx to proxy requests

If you run `pdf-bot` on port 3000 or similar it is recommended to run it behind an nginx proxy.

Create a site that listens to port 80 and uses the [config from the `production/` folder](https://github.com/esbenp/pdf-bot/blob/master/production/nginx.conf)
