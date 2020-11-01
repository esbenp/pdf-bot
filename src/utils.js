var isValidUrl = function (url) {
  return url.match(/(((file:\/|[A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/)
}

function getCurrentDateTimeAsString() {
  return (new Date()).toUTCString()
}

module.exports = {
  isValidUrl: isValidUrl,
  getCurrentDateTimeAsString: getCurrentDateTimeAsString
}
