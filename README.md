# winston-loggly-syslog

[![NPM version][npm-image]][npm-url]
[![NPM downloads][npm-downloads]][npm-url]
[![MIT License][license-image]][license-url]

A [Loggly][loggly] transport for [winston][winston] that uses Loggly's syslog interface.

## Installation

### Installing winston-loggly-syslog

``` bash
  $ npm install winston
  $ npm install winston-loggly-syslog
```

There is only one required option for logging to Loggly:

* __token:__ API Token for your account on Loggly

## Usage
``` js
  var winston = require('winston')

  //
  // Requiring `winston-loggly-syslog` will expose
  // `winston.transports.Loggly`
  //
  var logglyWinston = require('winston-loggly-syslog').Loggly

  var logger = new winston.Logger({
    transports: [
      new winston.transports.Loggly({
        token: 'abc'
      })
    ]
  })

  logger.info('this is my message')
```

For more some advanced logging, you can take advantage of custom formatting
and setting tags in Loggly:

``` js
  var winston = require('winston')

  //
  // Requiring `winston-loggly-syslog` will expose
  // `winston.transports.Loggly`
  //
  var logglyWinston = require('winston-loggly-syslog').Loggly

  var logger = new winston.Logger({
    transports: [
      new winston.transports.Loggly({
        token: 'abc',
        tags: ['tag1', 'tag2'],
        logFormat: function(message, meta) {
          if (!meta) meta = {}
          meta['message'] = message
          return JSON.stringify(meta)
        }
      })
    ]
  })

  logger.info('this is my message')
```

The Loggly transport is also capable of emitting events for `error` and `connect` so you can log to other transports:

``` js
var winston = require('winston')
  , Loggly = require('winston-loggly-syslog').Loggly

var logger
  , consoleLogger = new winston.transports.Console({
      level: 'debug',
      timestamp: function() {
        return new Date().toString()
      },
      colorize: true
    })
  , logglyTransport = new Loggly({
      token: 'abc'
    })

logglyTransport.on('error', function(err) {
  logger && logger.error(err)
})

logglyTransport.on('connect', function(message) {
  logger && logger.info(message)
})

var logger = new winston.Logger({
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  },
  transports: [
    logglyTransport,
    consoleLogger
  ]
})

logger.info('this is my message ' + new Date().getTime())
```

Currently, the Loggly transport only supports TLS logging over TCP.

## Credits

The code is based on the original version of [winston-papertrail][winston-papertrail].

## License: [MIT][license-url]

[loggly]: https://www.loggly.com
[winston]: https://github.com/winstonjs/winston
[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE
[npm-image]: http://img.shields.io/npm/v/winston-loggly-syslog.svg?style=flat
[npm-url]: https://npmjs.org/package/winston-loggly-syslog
[npm-downloads]: http://img.shields.io/npm/dm/winston-loggly-syslog.svg?style=flat
[winston-papertrail]: https://github.com/kenperkins/winston-papertrail
