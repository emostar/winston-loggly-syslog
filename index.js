var os = require('os')
  , tls = require('tls')
  , util = require('util')
  , winston = require('winston')

/**
 * Loggly class
 *
 * @description constructor for the Loggly transport
 *
 * @param {object}		options				options for your loggly transport
 *
 * @param {string}		options.host		host for loggly endpoint
 *
 * @param {Number}		options.port		port for loggly endpoint
 *
 * @param {string}		[options.hostname]	name for the logging hostname in Loggly
 *
 * @param {string}		[options.pid]	pid of the logging program
 *
 * @param {string}		[options.program]	name for the logging program
 *
 * @param {string}		[options.level]		log level for your transport (info)
 *
 * @param {Function}	[options.logFormat]	function to format your log message before sending
 *
 * @param {Number}		[options.attemptsBeforeDecay]	how many reconnections should
 * 														be attempted before backing of (5)
 *
 * @param {Number}		[options.maximumAttempts]		maximum attempts before
 * 														disabling buffering (25)
 *
 * @param {Number}		[options.connectionDelay]		delay between
 * 														reconnection attempts in ms (1000)
 *
 * @param {Boolean}		[options.handleExceptions]		passed to base Transport (false)
 *
 * @param {Number}		[options.maxDelayBetweenReconnection]	when backing off,
 * 																what's the max time between
 * 																reconnections (ms)
 *
 * @param {Boolean}		[options.inlineMeta]			inline multi-line messages (false)
 *
 * @type {Function}
 */
var Loggly = exports.Loggly = function(options) {
  var self = this
  options = options || {}

  self.name = 'Loggly'
  self.level = options.level || 'info'

  // Loggly Service Host
  self.host = options.host || 'logs-01.loggly.com'

  // Loggly Service Port
  self.port = options.port || 6514

  // Loggly Customer Token
  self.token = options.token

  // Loggly tags
  self.tags = options.tags || []

  // Hostname of the current app
  self.hostname = options.hostname || os.hostname()

  // PID of this process
  self.pid = options.pid || process.pid

  // Program is an affordance for Loggly to name the source of log entries
  self.program = options.program || 'default'

  // Format your log messages prior to delivery
  self.logFormat = options.logFormat || function(message, meta) {
    if (!meta) meta = {}
    if (message) meta['log_msg'] = message
    return JSON.stringify(meta)
  }

  // Number of attempts before decaying reconnection
  self.attemptsBeforeDecay = options.attemptsBeforeDecay || 5

  // Maximum number of reconnection attempts before disabling buffer
  self.maximumAttempts = options.maximumAttempts || 25

  // Delay between normal attempts
  self.connectionDelay = options.connectionDelay || 1000

  // Handle Exceptions
  self.handleExceptions = options.handleExceptions || false

  // Maximum delay between attempts
  self.maxDelayBetweenReconnection = options.maxDelayBetweenReconnection || 60000

  // Inline meta flag
  self.inlineMeta = options.inlineMeta || false

  self.currentRetries = 0
  self.totalRetries = 0
  self.buffer = ''
  self.loggingEnabled = true

  // Error out if we don't have a host or port
  if (!self.token) {
    throw new Error('Missing required parameters: token')
  }

  // Auth is sent in the structed data of the syslog message, so pre-construct it
  self.structuredData = '[' + self.token + '@41058'
  for (var tag in self.tags) {
    self.structuredData += ' tag="' + self.tags[tag] + '"'
  }
  self.structuredData += ']'

  // Open the connection
  try {
    connectStream()
  } catch (e) {
    // TODO figure out a better way of sending errors from connection
    self.emit('error', e)
  }

  // Opens a connection to Loggly
  function connectStream() {
    self.stream = tls.connect(self.port, self.host, {rejectUnauthorized:false}, onConnected)

    self.stream.on('error', function(err) {
      self.emit('error', err)

      // We use setTimeout to throttle the reconnection attempts

      setTimeout(function() {
        // Increment our retry counts
        self.currentRetries++
        self.totalRetries++

        // Decay the retry rate exponentially up to max between attempts
        if ((self.connectionDelay < self.maxDelayBetweenReconnection) && (self.currentRetries >= self.attemptsBeforeDecay)) {
          self.connectionDelay = self.connectionDelay * 2
          self.currentRetries = 0
        }

        connectStream()

        // Stop buffering messages after a fixed number of retries.
        // This is to keep the buffer from growing unbounded
        if (self.loggingEnabled && (self.totalRetries >= (self.maximumAttempts))) {
          self.loggingEnabled = false
          self.emit('error', new Error('Max entries eclipsed, disabling buffering'))
        }
      }, self.connectionDelay)
    })

    // If we have the stream end, simply reconnect
    self.stream.on('end', function() {
      connectStream()
    })
  }

  function onConnected() {
    // Reset our variables
    self.loggingEnabled = true
    self.currentRetries = 0
    self.totalRetries = 0
    self.connectionDelay = 1000

    self.emit('connect', 'Connected to Loggly at ' + self.host + ':' + self.port)

    // Did we get messages buffered
    if (self.buffer) {
      self.stream.write(self.buffer)
      self.buffer = ''
    }
  }
}

//
//
// Inherit from `winston.Transport` so you can take advantage
// of the base functionality and `.handleExceptions()`.
//
util.inherits(Loggly, winston.Transport)

//
// Define a getter so that `winston.transports.Loggly`
// is available and thus backwards compatible.
//
winston.transports.Loggly = Loggly

/**
 * Loggly.log
 *
 * @description Core logging method exposed to Winston. Metadata is optional.
 *
 * @param {String} 		level	Level at which to log the message.
 * @param {String}		msg		Message to log
 * @param {String|object|Function}		[meta]	Optional metadata to attach
 * @param {Function}	callback
 * @returns {*}
 */
Loggly.prototype.log = function(level, msg, meta, callback) {
  // make sure we handle when meta isn't provided
  if (typeof(meta) === 'function' && !callback) {
    callback = meta
    meta = {}
  }

  // If the logging buffer is disabled, drop the message on the floor
  if (!this.loggingEnabled) {
    return callback(null, true)
  }

  var output = msg

  // If we don't have a string for the message,
  // lets transform it before moving on
  if (typeof(output) !== 'string') {
    output = util.inspect(output)
  }

  this.sendMessage(level, msg, meta)

  callback(null, true)
}

/**
 * Loggly.sendMessage
 *
 * @description sending the message to the stream, or buffering if not connected
 *
 * @param {String}	level		Log level of the message
 * @param {String}	message		The message to deliver
 * @param {Object}	meta		Meta data for the log entry
 */
Loggly.prototype.sendMessage = function(level, message, meta) {
  var self = this

  // We use the 'user-level messages' facility
  var priVal = 8 + getPriority(level)

  var msg =
    '<' + priVal + '>1 ' +
    (new Date()).toISOString() + ' ' +
    self.hostname + ' ' +
    self.program + ' ' +
    self.pid + ' ' +
    '"-" ' + // Message ID
    self.structuredData + ' ' +
    self.logFormat(message, meta) +
    '\r\n'

  if (this.stream && this.stream.writable) {
    this.stream.write(msg)
  } else if (this.loggingEnabled) {
    this.buffer += msg
  }
}

// Helper function to change winston level to syslog priority
// If the level is not found, we default to 'info' (6)
var levelMap = {
  'emerg': 0,
  'alert': 1,
  'crit': 2,
  'error': 3,
  'warning': 4,
  'notice': 5,
  'info': 6,
  'debug': 7
}
function getPriority(level) {
  // Numerical values of syslog priorities
  return levelMap[level] || 6
}
