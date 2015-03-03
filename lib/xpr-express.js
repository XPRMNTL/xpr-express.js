/**
 * XPRMNTL Feature-client.js Plugin:
 * XPR - Connect
 *
 * Provides a middleware for `req.feature` as well
 * as an additional `app.feature` for experiments
 * that are outside of the scope of a user/request
 */

/**
 * Module Dependencies
 */
var expLib = require('experiment')
  , debug = require('debug')('XPRMNTL:express');

module.exports = XprmntlExpress;

function XprmntlExpress(config) {

  if (! (this instanceof XprmntlExpress)) {
    return new XprmntlExpress(config);
  }

  if (! config) config = {};

  /**
   * user read/write methods
   */
  this.readUser = config.readUser || this.defaultReadUser;
  this.saveUser = config.saveUser || this.defaultSaveUser;

  this.cookieName = config.cookieName || 'xpr.config';

  /**
   * These are the two experiments we're working on throughout
   */
  this.exps = {
    app: expLib(),
    shared: expLib()
  };

  /**
   * These are the hashes of the current configuration
   * of experiments of each type. This lets us know if the user
   * has outdated experiments data.
   */
  this.hashes = {
    app: null,
    shared: null
  };

  /**
   * This stores the most recent fetched data
   */
  this.lastFetch = null;

  /**
   * Have we had a successful fetch?
   */
  this.fetched = false;

  var self = this;

  return function init(client) {

    self.client = client;

    /**
     * Backed up remote functions
     */
    var _load = client.load;
    var _announce = client.announce;

    /**
     * Memoized functions
     */
    client.load = self.memoize(_load);
    client.announce = self.memoize(_announce);
    client.express = self.middleware.bind(self);

  };

}


/**
 * Memoizes the functions and binds to client
 */
XprmntlExpress.prototype.memoize = function(fn) {
  var self = this;
  return function(cb) {
    return fn.call(this.client, cb).then(function success(config) {
      debug('dowhatnow?!');
      self.saveLast(config);
    }, function failure(data) {
      var err = data[0]
        , defaults = data[1];

      debug('Fetch err: ', err);
      self.saveLast(defaults, true);
    });
  };
};


/**
 * Saves the last-fetch configuration
 *
 * If there is already a configuration, this does not override that
 * if the previous call was an error. This allows a startup to fetch
 * correct data, and on failure, not fall back to `default` data
 */
XprmntlExpress.prototype.saveLast = function(config, optional) {
  if (optional && this.fetched) return;

  var ref = this.client.getReference();

  this.hashes.app = this.exps.app.configure(config.app || {}, ref);
  if (config.shared && config.shared.experiments) this.hashes.shared = this.exps.shared.configure(config.shared, ref);

  this.fetched = true;
  this.lastFetch = config;
};


/**
 * Express middleware that attaches req.feature
 */
XprmntlExpress.prototype.middleware = function(req, res, next) {

  var user = this.readUser(req, res);
  if (! user) user = { dirty: {} };

  var userContexts = {
    app: this.exps.app.contextFor(user.bucket, user.id),
    shared: this.exps.shared.contextFor(user.bucket, user.id)
  };

  var userExps = {
    app: this.exps.app.readFor(userContexts.app, user.dirty.app),
    shared: this.exps.shared.readFor(userContexts.shared, user.dirty.shared)
  };

  // TODO: only if the user is outdated, generate a new cookie.
  if (user.id) this.saveUser(user.id, userExps, res);

  // QQ: Do I want to save a new cookie every time, to keep it updated?

  req.feature = reqFeature.bind(this);

  return next();

  function reqFeature(name, fallback) {
    if (undefined === fallback) fallback = false;

    if (undefined === userExps.app.features[name] === userExps.shared.features[name]) return fallback;

    var statuses = {
      app: this.exps.app.feature(name, userExps.app),
      shared: this.exps.shared.feature(name, userExps.shared),
    };

    return statuses.app || statuses.shared;
  }
};

/**
 * Default deserializer for the user object in express
 *
 * @param  {Object} req Express.js request object
 * @return {Object}     `user` object
 *
 * Example return:
 *
 * ```js
 * {
 *   id: string,
 *   bucket: int,
 *   hashes: {
 *     app: string,
 *     shared: string
 *   }
 *   dirty: {
 *     app: {
 *       key1: value1,
 *       ...
 *       keyN: valueN,
 *     },
 *     shared: {
 *       key1: value1,
 *       ...
 *       keyN: valueN,
 *     }
 *   }
 * }
 * ```
 */

XprmntlExpress.prototype.defaultReadUser = function(req, res) {
  var defaultCookie = {
    id: 'somethingHere',
    dirty: {}
  };
  var rawCookie = req.cookies[this.cookieName];
  if (! rawCookie) return defaultCookie;

  var user;

  var matcher = /u:([^«]*)«b:([^╣]*)╣app:«s:([^«]*)«d:([^║]*)║╣shared:«s:([^«]*)«d:([^║]*)║/;
  var matches = matcher.exec(rawCookie);

  try {
    user = {
      id : matches[1],
      bucket : matches[2],
      hashes : {
        app: matches[3],
        shared: matches[5]
      },
      dirty : {
        app: JSON.parse(matches[4]),
        shared: JSON.parse(matches[6])
      }
    };
  } catch (e) {
    console.warn('Experiment cookie bad: ', e);
    res.clearCookie(this.cookieName);
    return defaultCookie;
  }

  // var user = {
  //   id: 'something',
  //   bucket: 1,
  //   hashes: {
  //     app: 'yeah, no',
  //     shared: 'no, yeah'
  //   },
  //   dirty: {
  //     app: {
  //       objectedExp: true,
  //       exp1: true,
  //       exp2: false,
  //     },
  //     shared: {
  //       shExp1: false,
  //       shExp2: true,
  //     }
  //   }
  // };

  return user;
};

XprmntlExpress.prototype.defaultSaveUser = function(id, config, res) {
  var serial = this.serializeUser(id, config);

  res.cookie(this.cookieName, serial, { maxAge: 900000 });
};


XprmntlExpress.prototype.serializeUser = function(id, data) {
  var serial = 'u:' + id + '«b:' + data.app.bucket;

  serial += this.serializeAppData('app', data.app);
  serial += this.serializeAppData('shared', data.shared);

  return serial;
};

XprmntlExpress.prototype.serializeAppData = function(name, config) {
  var serial = '╣' + name + ':';

  serial += '«s:' + config.stamp;
  serial += '«d:' + JSON.stringify(config.dirtyFeatures);

  serial += '║';

  return serial;
};

