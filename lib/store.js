/**
 * Module imports
 */
var Buffer    = require('buffer').Buffer,
    redis     = require('redis');

/**
 * Array.prototype.slice reference
 */
var slice = Array.prototype.slice;

/**
 * Empty noop function
 */
var noop = function() {};

/**
 * Constructor
 *
 * @param {Object}  options Optional options object
 */
function RedisStore(options) {
  if (!(this instanceof RedisStore)) {
    return new RedisStore(options);
  }
  var type,
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
}

/**
 * Export RedisStore
 */
module.exports = RedisStore;

/**
 * Get the values of all the given hash fields
 *
 * @param   {String}    key     Hash key
 * @param   {...String} field   Hash field(s) or omit for all
 * @param   {Function}  cb      Callback function
 * @return  {this}      for chaining
 */
RedisStore.prototype.get = function() {
  var self = this,
      args = slice.call(arguments),
      cb = args.pop(),
      key = this.cacheKey(args.shift()),
      len = args.length;
  if (typeof cb !== 'function') {
    return this;
  }
  if (key) {
    // Unwrap the first argument if its an array
    if (len === 1 && Array.isArray(args[0])) {
      args = args[0];
      len = args.length;
    }
    if (args.length === 0) {
      this.client.hgetall(key, function(err, data) {
        if (data && data === Object(data)) {
          Object.keys(data).forEach(function(value) {
            data[value] = self._parse(data[value]);
          });
        }
        cb(err, data);
      });
    } else {
      this.client.hmget(key, args, function(err, data) {
        var obj;
        if (Array.isArray(data)) {
          if (args.length === 1) {
            obj = self._parse(data.shift());
          } else if (args.length === data.length) {
            obj = {};
            args.forEach(function(val, index) {
              obj[val] = self._parse(data[index]);
            });
          }
        }
        if (obj === undefined) {
          obj = null;
        }
        return cb(err, obj);
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
    this.client.keys(pattern, cb);
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
    cb(null, exists === 1);
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
  this.client.hkeys(key, cb);
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
  if (!this.autoCast || Buffer.isBuffer(value) || typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (e) {}
  return value;
};

