var errorUtils = require('../src/error')

describe('Error utils', function() {
  it('should correctly determine if error response', function() {
    var notError1 = errorUtils.isError({ code: '001' })
    var notError2 = errorUtils.isError({ error: true })
    var error = errorUtils.isError({ code: '001', error: true })

    if (notError1 === true || notError2 === true) {
      throw new Error('Wrongly determined error response')
    }

    if (!error) {
      throw new Error('Did not determine error response')
    }
  })
})
