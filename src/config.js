var merge = require('lodash.merge')

const defaultConfig = {
  api: {
    port: 3005,
    token: '1234'
  },
  storagePath: 'storage'
}

const createConfig = (configPath) => {
  return merge(defaultConfig, require(configPath))
}

module.exports = createConfig
