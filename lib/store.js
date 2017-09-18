/**
 * Module imports
 */
var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    redis = require('redis');

/**
 * Array.prototype.slice reference
 */
var slice = Array.prototype.slice;

/**
 * Empty noop function
 */
var noop = function() {};

/**
 * Check if Buffer.from exists
 */
var BUFFER_FROM = typeof Buffer.from === 'function';
var ENCODING = 'utf8';

/**
 * Create a buffer from a string
 *
 * @param   {String}    str         String value
 * @param   {String}    [encoding]  Optional string encoding
 * @returns {Buffer}    string as buffer
 */
function createBuffer(str, encoding) {
  if (BUFFER_FROM) {
    return Buffer.from(str, encoding || ENCODING);
  }
  return new Buffer(str, encoding || ENCODING);
}

/**
 * Convert a value
 *
 * @param   {*}         value       Value to convert
 * @param   {Boolean}   rawBuffer   true to return a raw buffer
 * @param   {Boolean}   cast        true to cast the value
 * @returns {*}         converted value
 */
function convertValue(value, cast) {
  var val;
  if (value === null || value === undefined) {
    return value;
  }
  val = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (cast !== false && typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch (e) {}
  }
  return val;
}

/**
 * Generate a property to lazily convert a Buffer value
 *
 * @param   {Object}    target      Target object
 * @param   {String}    name        Property name
 * @param   {*}         value       Property value
 * @param   {Boolean}   rawBuffer   true to return a raw buffer
 * @param   {Boolean}   cast        true to cast the value
 */
function wrapData(target, name, value, rawBuffer, cast) {
  var converted = false;
  var val;
  if (!target.hasOwnProperty(name)) {
    if (value === null || value === undefined || (rawBuffer === true && Buffer.isBuffer(value))) {
      converted = true;
      val = value;
    }
    Object.defineProperty(target, name, {
      get: function() {
        if (!converted) {
          val = convertValue(value, cast);
          converted = true;
        }
        return val;
      },
      enumerable: true,
    });
  }
}

/**
 * Constructor
 *
 * @param {Object}  options Optional options object
 */
function RedisStore(options) {
  if (!(this instanceof RedisStore)) {
    return new RedisStore(options);
  }
  var self = this,
      type,
      autoCast,
      delimiter = ':',
      client,
      pw,
      db;
  if (!options) {
    options = {};
  }
  // Set the delimiter property
  type = typeof options.delimiter;
  if ((type === 'string' && options.delimiter) || type === 'number') {
    delimiter = options.delimiter;
  }
  Object.defineProperty(this, 'delimiter', {
    value: delimiter,
    writable: false
  });
  // Set the automatic cast property
  autoCast = options.autoCast !== false;
  Object.defineProperty(this, 'autoCast', {
    value: autoCast,
    writable: false
  });
  // Create the Redis connection
  if (options.client) {
    client = options.client;
  } else {
    client = redis.createClient(options.port, options.host, options.options);
    pw = options.pw || options.pass || options.password;
    db = options.db || options.database;
    if (typeof db !== 'number') {
      if (typeof db === 'string') {
        db = parseInt(db, 10);
      }
    }
    if (db && typeof db !== 'number') {
      db = parseInt(db, 10);
    }
    if (!(typeof db === 'number' && !isNaN(db))) {
      db = null;
    }
    if (pw) {
      client.auth(pw, function() {
        if (typeof db === 'number' && !isNaN(db)) {
          client.select(db);
        }
      });
    } else if (typeof db === 'number' && !isNaN(db)) {
      client.select(db);
    }
  }
  Object.defineProperty(this, 'client', {
    value: client,
    writable: false
  });
  EventEmitter.call(this);
  ['ready', 'connect', 'end'].forEach(function(name) {
    client.on(name, function() {
      self.emit(name);
    });
  });
  client.on('error', function(error) {
    self.emit('error', error);
  });
}
util.inherits(RedisStore, EventEmitter);

/**
 * Export RedisStore
 */
module.exports = RedisStore;

/**
 * Get the values of all the given hash fields
 *
 * @param   {String}    key         Hash key
 * @param   {Boolean}   [asBuffer]  true if return data as a Buffer
 * @param   {...String} field       Hash field(s) or omit for all
 * @param   {Function}  cb          Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.get = function() {
  var self = this,
      args = slice.call(arguments),
      cb = args.pop(),
      key = this.cacheKey(args.shift()),
      len = args.length,
      asBuffer = false;
  if (typeof cb !== 'function') {
    return this;
  }
  if (key) {
    // Unwrap the first argument if its an array
    if (len === 1 && Array.isArray(args[0])) {
      args = args[0];
      len = args.length;
    }
    if (len && args[0] === true || args[0] === false) {
      asBuffer = args[0];
      args.shift();
      len = len - 1;
    }
    if (asBuffer === true) {
      key = createBuffer(key);
    }
    if (args.length === 0) {
      this.client.hgetall(key, function iterator(err, data) {
        var output;
        if (data && data === Object(data)) {
          output = {};
          Object.keys(data).forEach(function(value) {
            wrapData(output, value, data[value], asBuffer, self._autoCast);
          });
        }
        cb(err, output);
      });
    } else {
      this.client.hmget(key, args, function(err, data) {
        var val;
        var output;
        if (Array.isArray(data)) {
          if (args.length === 1) {
            val = data.shift();
            if (asBuffer === true && Buffer.isBuffer(val)) {
              output = val;
            } else {
              output = convertValue(val, self._autoCast);
            }
          } else if (args.length === data.length) {
            output = {};
            args.forEach(function iterator(value, index) {
              wrapData(output, value, data[index], asBuffer, self._autoCast);
            });
          }
        }
        if (output === undefined) {
          output = null;
        }
        return cb(err, output);
      });
    }
  } else {
    cb(new Error('Invalid key'));
  }
  return this;
};

/**
 * Set the values of given hash fields
 *
 * @param   {String}        key     Hash key
 * @param   {String|Object} field   Hash field or object
 * @param   {Object}        value   Value (if field is not object)
 * @param   {Function}      cb      Callback function
 * @return  {this}          for chaining
 */
RedisStore.prototype.set = function() {
  var self = this,
      args = slice.call(arguments),
      cb = args.pop(),
      key = this.cacheKey(args.shift()),
      err = null,
      data,
      len;
  if (cb && typeof cb !== 'function') {
    args.push(cb);
    cb = null;
  }
  len = args.length;
  if (key) {
    // Unwrap the first argument if its an array
    if (len === 1 && Array.isArray(args[0])) {
      args = args[0];
      len = args.length;
    }
    if (len === 0) {
      err = new Error('Invalid data');
    } else {
      // Unwrap the first argument if its an array
      if (len === 1 && Array.isArray(args[0])) {
        args = args[0];
        len = args.length;
      }
      if (len === 1) {
        if (args[0] === Object(args[0])) {
          data = args[0];
          Object.keys(data).forEach(function(val) {
            data[val] = self._stringify(data[val]);
          });
        }
      } else {
        data = {};
        if (len === 2) {
          data[args[0]] = self._stringify(args[1]);
        } else if (len > 2) {
          for (var i = 0; i < len; i += 2) {
            if (i + 1 < len) {
              data[args[i]] = self._stringify(args[i + 1]);
            }
          }
        }
      }
      this.client.hmset(key, data, cb || noop);
    }
  } else {
    err = new Error('Invalid key');
  }
  if (err && typeof cb === 'function') {
    cb(err, 0);
  }
  return this;
};

/**
 * Find all keys matching a given pattern
 *
 * @param   {String|RegExp} pattern   Key pattern
 * @param   {Function}      cb        Callback function
 * @return  {this}          for chaining
 */
RedisStore.prototype.keys = function(pattern, cb) {
  var type = typeof pattern;
  if (type === 'function') {
    pattern(new Error('Invalid pattern'));
    return this;
  }
  if (typeof cb !== 'function') {
    return this;
  }
  if (Array.isArray(pattern)) {
    pattern = this.cacheKey(pattern);
    type = typeof pattern;
  }
  if ((type === 'string' && pattern) || type === 'number') {
    this.client.keys(pattern, function(err, keys) {
      cb(err, Array.isArray(keys) ? keys.map(convertValue) : keys);
    });
  } else {
    cb(new Error('Invalid pattern'));
  }
  return this;
};

/**
 * Determine if a hash field exists
 *
 * @param   {String}    key     Hash key
 * @param   {String}    field   Hash field
 * @param   {Function}  cb      Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.exists = function(key, field, cb) {
  if (typeof key === 'function') {
    key(new Error('Invalid key'));
  } else if (typeof field === 'function') {
    field(new Error('Invalid field'));
  }
  if (typeof cb !== 'function') {
    return this;
  }
  key = this.cacheKey(key);
  if (!key) {
    return cb(new Error('Invalid key'));
  }
  this.client.hexists(key, field, function(err, exists) {
    var val;
    if (Buffer.isBuffer(exists)) {
      val = parseInt(exists.toString('utf8'), 10);
    } else {
      val = exists;
    }
    cb(null, val === 1);
  });
  return this;
};

/**
 * Delete given hash fields
 *
 * @param   {String}    key     Hash key
 * @param   {...String} field   Hash field(s)
 * @param   {Function}  cb      Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.del = function() {
  var args = slice.call(arguments),
      cb = args.pop(),
      key = this.cacheKey(args.shift());
  if (typeof cb !== 'function') {
    args.push(cb);
    cb = null;
  }
  if (key) {
    if (args.length === 1 && Array.isArray(args[0])) {
      args = args[0];
    }
    args.unshift(key);
    this.client.hdel(args, function(err) {
      if (typeof cb === 'function') {
        cb(err);
      }
    });
  } else {
    if (typeof cb === 'function') {
      cb(new Error('Invalid key'));
    }
  }
  return this;
};

/**
 * Clear the provided keys
 *
 * @param   {String}    key     Hash key
 * @param   {Function}  cb      Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.flush = function() {
  var args = slice.call(arguments),
      len = args.length,
      cb;
  if (len > 0 && !Array.isArray(args[len - 1])) {
    cb = args.pop();
    len -= 1;
  }
  if (len === 1 && Array.isArray(args[0])) {
    args = args[0];
    len = args.length;
  }
  if (len > 0) {
    args.forEach(function(value, index) {
      args[index] = this.cacheKey(value);
    }, this);
    this.client.del(args, cb || noop);
  } else {
    if (typeof cb === 'function') {
      cb(new Error('Invalid key'));
    }
  }
  return this;
};

/**
 * Generate a cache key
 *
 * @param   {Array|String}  key   Cache key array
 * @return  {String}        cache key
 */
RedisStore.prototype.cacheKey = function(key) {
  var type;
  if (Array.isArray(key) && key.length > 0) {
    return key.join(this.delimiter);
  }
  type = typeof key;
  if ((type === 'string' && key) || (type === 'number')) {
    return key;
  }
};

/**
 * Return a list of field keys
 *
 * @param   {String}    key     Hash key
 * @param   {Function}  cb      Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.fields = function(key, cb) {
  if (typeof key === 'function') {
    key(new Error('Invalid key'));
  }
  if (typeof cb !== 'function') {
    return this;
  }
  key = this.cacheKey(key);
  if (!key) {
    return cb(new Error('Invalid key'));
  }
  this.client.hkeys(key, function(err, fields) {
    cb(err, Array.isArray(fields) ? fields.map(convertValue) : fields);
  });
  return this;
};

/**
 * Stringify data for Redis
 *
 * @param   {Object|Buffer}   value Value to stringify
 * @return  {String|Buffer}   stringified value
 */
RedisStore.prototype._stringify = function(value) {
  if (!this.autoCast  || Buffer.isBuffer(value) || typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
};

/**
 * Parse a stringified value from Redis
 *
 * @param   {String|Buffer}   value Value to parse
 * @return  {Object|Buffer}   parsed value
 */
RedisStore.prototype._parse = function(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  return convertValue(value, this.autoCast);
};
