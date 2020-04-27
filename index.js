'use strict';

/**
 * MSSQL specific extension of the {@link Manager~ConnectionOptions} from the [`sqler`](https://ugate.github.io/sqler/) module.
 * @typedef {Manager~ConnectionOptions} MSConnectionOptions
 * @property {Object} driverOptions The `mssql` module specific options. __Both `client` and `pool` will be merged when generating the connection pool.__
 * @property {Object} [driverOptions.connection] An object that will contain properties/values that will be used to construct the MSSQL connections
 * (e.g. `{ database: 'mydb', requestTimeout: 10000 }`). See the `mssql` module documentation for a full listing of available connection options.
 * When a property value is a string surrounded by `${}`, it will be assumed to be a property that resides on either the {@link Manager~PrivateOptions}
 * passed into the {@link Manager} constructor or a property on the {@link MSConnectionOptions} itself (in that order of precedence). For example, 
 * `connOpts.host = '127.0.0.1'` and `driverOptions.connection.host = '${host}'` would be interpolated into `driverOptions.connection.host = '127.0.0.1'`.
 * In contrast to `privOpts.username = 'someUsername' and `driverOptions.connection.user = '${username}'` would be interpolated into
 * `driverOptions.connection.user = 'someUsername'`. Also, any other interpolated values will be assumed to be a _constant_ property that resides on the
 * `mssql` module and will be interpolated accordingly.
 * For example `driverOptions.connection.pool.someProp = '${SOME_MSSQL_CONSTANT}'` will be interpolated as `pool.someProp = mssql.SOME_MSSQL_CONSTANT`.
 * __Using any of the generic `pool.someOption` will override the `conf` options set on `driverOptions.connection.pool`__ (e.g. `pool.max = 10` would override 
 * `driverOptions.connection.pool.max = 20`).
 */

/**
 * MSSQL specific extension of the {@link Manager~ExecOptions} from the [`sqler`](https://ugate.github.io/sqler/) module. When a property of `binds`
 * contains an object it will be _interpolated_ for property values on the `mssql` module.
 * For example, `binds.name = '${SOME_MSSQL_CONSTANT}'` will be interpolated as `binds.name = mssql.SOME_MSSQL_CONSTANT`.
 * @typedef {Manager~ExecOptions} MSExecOptions
 * @property {Object} [driverOptions] The `mssql` module specific options.
 * @property {Object} [driverOptions.query] The options passed into `mssql.Client.query` during {@link Manager.exec}. See the `mssql` module documentation
 * for a full listing of available query options.
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `mssql` module and will be interpolated
 * accordingly.
 * For example `driverOptions.query.someDriverProp = '${SOME_MSSQL_CONSTANT}'` will be interpolated as
 * `driverOptions.query.someDriverProp = mssql.SOME_MSSQL_CONSTANT`.
 * @property {(String | Boolean)} [driverOptions.query.name] As stated in the `mssql` documentation, the `name` option will cause a perpared statemenet to be
 * used. `sqler-mssql` allows a `true` value to be set to utilize the internally generated SQL file name to be used instead of explicitly defining a
 * name (which is of course, also supported).
 */

/**
 * MSSQL {@link Dialect} implementation for [`sqler`](https://ugate.github.io/sqler/).
 * Typically, an application will not have to directly interact with the dialect. All API interactions will take place using the {@link Manager}
 * interface that resides within the [`sqler`](https://ugate.github.io/sqler/) module.
 */
module.exports = class MSDialect {

  /**
   * Constructor
   * @constructs MSDialect
   * @param {Manager~PrivateOptions} priv The private configuration options
   * @param {MSConnectionOptions} connConf The individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {Manager~Track} track Container for sharing data between {@link Dialect} instances.
   * @param {Function} [errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] A flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    if (!connConf.driverOptions) throw new Error('Connection configuration is missing required driverOptions');
    const dlt = internal(this);
    dlt.at.track = track;
    dlt.at.driver = require('mssql');
    dlt.at.connections = {};
    dlt.at.opts = {
      autoCommit: true, // default autoCommit = true to conform to sqler
      id: `sqlerMSSQLGen${Math.floor(Math.random() * 10000)}`,
      connection: connConf.driverOptions.connection ? dlt.at.track.interpolate({}, connConf.driverOptions.connection, dlt.at.driver) : {}
    };
    // sqler compatible state
    dlt.at.state = {
      pending: 0
    };

    dlt.at.errorLogger = errorLogger;
    dlt.at.logger = logger;
    dlt.at.debug = debug;

    // connection
    if (priv.host) dlt.at.opts.connection.host = priv.host;
    if (priv.hasOwnProperty('port')) dlt.at.opts.connection.port = priv.port;
    dlt.at.opts.connection.user = priv.username;
    dlt.at.opts.connection.password = priv.password;

    // connection pool
    if (!opts.connection.pool) opts.connection.pool = {};
    if (connConf.pool) {
      if (connConf.pool.hasOwnProperty('min')) dlt.at.opts.connection.pool.min = connConf.pool.min;
      if (connConf.pool.hasOwnProperty('max')) dlt.at.opts.connection.pool.max = connConf.pool.max;
      if (connConf.pool.hasOwnProperty('idle')) dlt.at.opts.connection.pool.idleTimeoutMillis = connConf.pool.idle;
      // if (connConf.pool.hasOwnProperty('increment')) dlt.at.opts.connection.pool.incrementSize = connConf.pool.increment; // not supported
      if (connConf.pool.hasOwnProperty('timeout')) dlt.at.opts.connection.pool.connectionTimeout = connConf.pool.timeout;
    }
  }

  /**
   * Initializes {@link MSDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} The MSSQL connection pool
   */
  async init(opts) {
    const dlt = internal(this), numSql = opts.numOfPreparedStmts;
    let conn, error;
    try {
      dlt.at.pool = new dlt.at.driver.ConnectionPool(dlt.at.opts.connection);
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-mssql: Connection pool "${dlt.at.opts.id}" created with (${numSql} SQL files) ` +
          `max=${dlt.at.opts.connection.pool.max} min=${dlt.at.opts.connection.pool.min} ` + 
          `idleTimeoutMillis=${dlt.at.opts.connection.pool.idleTimeoutMillis} ` +
          `connectionTimeout=${dlt.at.opts.connection.pool.connectionTimeout}`);
      }
      conn = await dlt.at.pool.connect();
      return dlt.at.pool;
    } catch (err) {
      error = err;
      const msg = `sqler-mssql: connection pool "${dlt.at.opts.id}" could not be created`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`${msg} (passwords are omitted from error) ${JSON.stringify(err, null, ' ')}`);
      }
      const pconf = Object.assign({}, dlt.at.opts.connection);
      delete pconf.password;
      err.message = `${err.message}\n${msg} for ${JSON.stringify(pconf, null, ' ')}`;
      err.sqlerMSSQL = pconf;
      throw err;
    } finally {
      if (conn) {
        await operation(dlt, 'close', false, conn, opts, error)();
      }
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   * @param {String} txId The transaction ID that will be started
   */
  async beginTransaction(txId) {
    const dlt = internal(this);
    if (dlt.at.connections[txId]) return;
    if (dlt.at.logger) {
      dlt.at.logger(`sqler-mssql: Beginning transaction "${txId}" on connection pool "${dlt.at.opts.id}"`);
    }
    dlt.at.connections[txId] = await dlt.this.getConnection({ transactionId: txId });
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {MSExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @param {Manager~ExecMeta} meta The SQL execution metadata
   * @param {(Manager~ExecErrorOptions | Boolean)} [errorOpts] The error options to use
   * @returns {Dialect~ExecResults} The execution results
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    const dlt = internal(this);
    let conn, bndp = {}, rslts;
    try {
      // interpolate and remove unused binds since
      // MSSQL only accepts the exact number of bind parameters (also, cuts down on payload bloat)
      bndp = dlt.at.track.interpolate(bndp, opts.binds, dlt.at.driver, props => sql.includes(`:${props[0]}`));

      // driver options query override
      const dopts = opts.driverOptions || {};
      if (!dopts.query) dopts.query = {};
      dopts.query.values = [];
      dopts.query.text = dlt.at.track.positionalBinds(sql, bndp, dopts.query.values, (name, index) => `$${index + 1}`);

      const rtn = {};

      if (!opts.transactionId && opts.type === 'READ') {
        rslts = await dlt.at.pool.request().query(dopts.query);
        rtn.rows = rslts.rows;
        rtn.raw = rslts;
      } else {
        // name will cause mssql to use a prepared statement
        if (dopts.query.name === true) dopts.query.name = meta.name;
        conn = await dlt.this.getConnection(opts);
        rslts = await conn.query(dopts.query);
        rtn.rows = rslts.rows;
        rtn.raw = rslts;
        if (conn instanceof dlt.at.driver.Transaction) {
          if (opts.autoCommit) {
            await operation(dlt, 'commit', false, conn, opts)();
          } else {
            dlt.at.state.pending++;
            rtn.commit = operation(dlt, 'commit', true, conn, opts);
            rtn.rollback = operation(dlt, 'rollback', true, conn, opts);
          }
        }
      }

      return rtn;
    } catch (err) {
      const msg = ` (BINDS: [${Object.keys(bndp)}], FRAGS: ${Array.isArray(frags) ? frags.join(', ') : frags})`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to execute the following SQL: ${sql}`, err);
      }
      err.message += msg;
      throw err;
    }
  }

  /**
   * Gets the currently open connection or a new connection when no transaction is in progress
   * @protected
   * @param {MSExecOptions} opts The execution options
   * @returns {Object} The connection (when present)
   */
  async getConnection(opts) {
    const dlt = internal(this);
    const txId = opts.transactionId;
    let conn = txId ? dlt.at.connections[txId] : null;
    if (!conn) {
      if (txId) {
        conn = dlt.at.pool.transaction();
        await conn.begin(opts.isolationLevel);
      } else {
        conn = dlt.at.pool.request();
      }
    }
    return conn;
  }

  /**
   * Closes the MSSQL connection pool
   * @returns {Integer} The number of connections closed
   */
  async close() {
    const dlt = internal(this);
    let error;
    try {
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-mssql: Closing connection pool "${dlt.at.opts.id}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      const cproms = [];
      for (let txId in dlt.at.connections) {
        cproms.push(dlt.at.connections[txId].end());
      }
      if (cproms.length) {
        await Promise.all(cproms);
        dlt.at.connections = {};
      }
      if (dlt.at.pool) {
        // mssql module contains bug on some occasions calling end w/o a callback
        // may result in unreported errors 
        await dlt.at.pool.end(err => {
          error = err;
        });
      }
    } catch (err) {
      error = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`sqler-mssql: Failed to close connection pool "${dlt.at.opts.id}" (uncommitted transactions: ${dlt.at.state.pending})`, err);
      }
    }
    if (error) throw error;
    return dlt.at.state.pending;
  }

  /**
   * @returns {Manager~State} The state
   */
  get state() {
    const dlt = internal(this);
    return {
      connection: {
        count: (dlt.at.pool && dlt.at.pool.totalCount) || 0,
        inUse: (dlt.at.pool && dlt.at.pool.waitingCount) || 0
      },
      pending: dlt.at.state.pending || (dlt.at.pool && dlt.at.pool.waitingCount) || 0
    };
  }

  /**
   * @protected
   * @returns {Object} The MSSQL driver module
   */
  get driver() {
    return internal(this).at.driver;
  }
};

/**
 * Executes a function by name that resides on the MSSQL connection
 * @private
 * @param {Object} dlt The internal MSSQL object instance
 * @param {String} name The name of the function that will be called on the connection
 * @param {Boolean} reset Truthy to reset the pending connection and transaction count when the operation completes successfully
 * @param {Object} conn The connection
 * @param {Manager~ExecOptions} [opts] The {@link Manager~ExecOptions}
 * @param {Error} [error] An originating error where any oprational errors will be set as a property of the passed error
 * (e.g. `name = 'close'` would result in `error.closeError = someInternalError`). __Internal Errors will not be thrown.__
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(dlt, name, reset, conn, opts, error) {
  return async () => {
    let ierr;
    try {
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-mssql: Performing ${name} on connection pool "${dlt.at.opts.id}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      if (name === 'commit' || name === 'rollback') {
        await conn.query(name.toUpperCase());
      } else {
        await conn[name]();
      }
      if (reset) { // not to be confused with mssql connection.reset();
        if (opts && opts.transactionId) delete dlt.at.connections[opts.transactionId];
        dlt.at.state.pending = 0;
      }
    } catch (err) {
      ierr = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`sqler-mssql: Failed to ${name} ${dlt.at.state.pending} transaction(s) with options: ${
          opts ? JSON.stringify(opts) : 'N/A'}`, ierr);
      }
      if (error) {
        error[`${name}Error`] = err;
      } else {
        throw err;
      }
    } finally {
      if (name !== 'end' && name !== 'release') {
        try {
          await conn.release();
        } catch (endErr) {
          if (ierr) {
            ierr.releaseError = endErr;
          }
        }
      }
    }
    return dlt.at.state.pending;
  };
}

// private mapping
let map = new WeakMap();
let internal = function(object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};