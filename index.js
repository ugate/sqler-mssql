'use strict';

/**
 * MSSQL {@link Dialect} implementation for [`sqler`](https://ugate.github.io/sqler/).
 * Typically, an application will not have to directly interact with the dialect. All API interactions will take place using the {@link Manager}
 * interface that resides within the [`sqler`](https://ugate.github.io/sqler/) module.
 */
module.exports = class MSDialect {

  /**
   * Constructor
   * @constructs MSDialect
   * @param {SQLERPrivateOptions} priv The private configuration options
   * @param {MSConnectionOptions} connConf The individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {SQLERTrack} track Container for sharing data between {@link Dialect} instances.
   * @param {Function} [errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] A flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    const dopts = connConf.driverOptions || {};
    const dlt = internal(this);
    dlt.at.track = track;
    dlt.at.driver = require('mssql');
    dlt.at.txs = new Map();
    dlt.at.stmts = new Map();
    dlt.at.pends = [];
    dlt.at.iop = new Map();
    dlt.at.opts = {
      autoCommit: true, // default autoCommit = true to conform to sqler
      id: `sqlerMSSQLGen${Math.floor(Math.random() * 10000)}`,
      connection: dopts.connection ? dlt.at.track.interpolate({}, dopts.connection, dlt.at.driver) : {}
    };
    // sqler compatible state
    dlt.at.state = {
      pending: 0
    };

    dlt.at.errorLogger = errorLogger;
    dlt.at.logger = logger;
    dlt.at.debug = debug;

    // connection
    if (priv.host) dlt.at.opts.connection.server = priv.host;
    if (!dlt.at.opts.connection.server) {
      // default for compatibility
      dlt.at.opts.connection.server = 'localhost';
    }
    if (priv.hasOwnProperty('port')) dlt.at.opts.connection.port = priv.port;
    dlt.at.opts.connection.user = priv.username;
    dlt.at.opts.connection.password = priv.password;

    // connection pool
    if (!dlt.at.opts.connection.pool) dlt.at.opts.connection.pool = {};
    if (connConf.pool) {
      if (connConf.pool.hasOwnProperty('min')) dlt.at.opts.connection.pool.min = connConf.pool.min;
      if (connConf.pool.hasOwnProperty('max')) dlt.at.opts.connection.pool.max = connConf.pool.max;
      if (connConf.pool.hasOwnProperty('idle')) dlt.at.opts.connection.pool.idleTimeoutMillis = connConf.pool.idle;
      // if (connConf.pool.hasOwnProperty('increment')) dlt.at.opts.connection.pool.incrementSize = connConf.pool.increment; // not supported
      // connectionTimeout is on "opts.connection" as of version >= 7 rather than on "opts.connection.pool"
      // if (connConf.pool.hasOwnProperty('timeout')) dlt.at.opts.connection.pool.connectionTimeout = connConf.pool.timeout;
      if (connConf.pool.hasOwnProperty('timeout')) dlt.at.opts.connection.connectionTimeout = connConf.pool.timeout;
    }
  }

  /**
   * Initializes {@link MSDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} The MSSQL connection pool
   */
  async init(opts) {
    const dlt = internal(this), numSql = opts.numOfPreparedFuncs;
    try {
      dlt.at.pool = new dlt.at.driver.ConnectionPool(dlt.at.opts.connection);
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-mssql: Connection pool "${dlt.at.opts.id}" created with (${numSql} SQL files) ` +
          `max=${dlt.at.opts.connection.pool.max} min=${dlt.at.opts.connection.pool.min} ` + 
          `idleTimeoutMillis=${dlt.at.opts.connection.pool.idleTimeoutMillis} ` +
          `connectionTimeout=${dlt.at.opts.connection.connectionTimeout}`);
      }
      dlt.at.pool.on('error', err => {
        if (dlt.at.errorLogger) {
          dlt.at.errorLogger(`sqler-mssql: Connection pool emitted error "${err.message}"`, err);
        }
      });
      await dlt.at.pool.connect();
      return dlt.at.pool;
    } catch (err) {
      const msg = `sqler-mssql: connection pool "${dlt.at.opts.id}" could not be created`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`${msg} (passwords are omitted from error) ${JSON.stringify(err, null, ' ')}`);
      }
      const pconf = Object.assign({}, dlt.at.opts.connection);
      delete pconf.password;
      err.message = `${err.message}\n${msg} for ${JSON.stringify(pconf, null, ' ')}`;
      err.sqlerMSSQL = pconf;
      throw err;
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   * @param {String} txId The transaction ID that will be started
   * @param {MSTransactionOptions} opts The transaction options
   * @returns {SQLERTransaction} The transaction
   */
  async beginTransaction(txId, opts) {
    const dlt = internal(this);
    /** @type {MSTransactionOptions} */
    const topts = dlt.at.track.interpolate({}, opts, dlt.at.driver.ISOLATION_LEVEL);
    if (dlt.at.logger) {
      dlt.at.logger(`sqler-mssql: Beginning transaction "${txId}" on connection pool "${dlt.at.opts.id}" with transaction options:\n${
        JSON.stringify(topts.isolationLevel)
      })`);
    }
    /** @type {MSPlan} */
    const plan = await dlt.this.planner({
      transactionId: txId,
      isolationLevel: topts.isolationLevel
    });
    return plan.txo.tx;
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {MSExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @param {SQLERExecMeta} meta The SQL execution metadata
   * @param {(SQLERExecErrorOptions | Boolean)} [errorOpts] The error options to use
   * @returns {Dialect~ExecResults} The execution results
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    const dlt = internal(this);
    let plan, bndp = {}, bnds = [], inputBindTypes, outputBindTypes, esql = sql, rslts;
    try {
      // interpolate and remove unused binds since
      // MSSQL only accepts the exact number of bind parameters (also, cuts down on payload bloat)
      bndp = dlt.at.track.interpolate(bndp, opts.binds, dlt.at.driver, props => sql.includes(`:${props[0]}`));
      inputBindTypes = opts.driverOptions && opts.driverOptions.inputBindTypes ?
        dlt.at.track.interpolate({}, opts.driverOptions.inputBindTypes, dlt.at.driver)
        : null;
      outputBindTypes = opts.driverOptions && opts.driverOptions.outputBindTypes ?
        dlt.at.track.interpolate({}, opts.driverOptions.outputBindTypes, dlt.at.driver)
        : null;
      // input/output types are globally set for a statement rather than on each prepared statement instance
      // so, they have to be kept track of on a SQL/meta path basis to prevent dupication errors
      let iop = (inputBindTypes || outputBindTypes) && dlt.at.iop.get(meta.path);
      if ((inputBindTypes || outputBindTypes) && !iop) {
        dlt.at.iop.set(meta.path, iop = {
          inputs: new Map(),
          outputs: new Map()
        });
      }

      const rtn = {};

      plan = await dlt.this.planner(opts, meta);
      const bnames = plan.stmt ? null : [];const ddd = Math.random();

      // mssql expects the format: @paramName
      esql = dlt.at.track.positionalBinds(esql, bndp, bnds, (name, index) => {
        // mssqsl input/bind parameters
        const inputType = inputBindTypes && inputBindTypes[name];
        if (plan.stmt && !iop.inputs.has(name)) {
          if (!inputType) {
            throw new Error(`Prepared statements require a "execOpts.driverOptions.inputBindTypes" to be set for bind variable ` + 
              `"${name}" for SQL "${meta.name}"`);
          }
          plan.stmt.ps.input(name, inputType);
          iop.inputs.set(name, inputType);
        } else if (!plan.stmt && !bnames.includes(name)) {
          if (inputType) plan.req.input(name, inputType, bndp[name]);
          else plan.req.input(name, bndp[name]);
          bnames.push(name);
        }
        return `@${name}`;
      });

      // output types
      for (let name in outputBindTypes) {
        if (plan.stmt && !iop.outputs.has(name)) {
          plan.stmt.ps.output(name, outputBindTypes[name]);
          iop.outputs.set(name, outputBindTypes[name]);
        } else if (!plan.stmt) {
          plan.req.output(name, outputBindTypes[name]);
        }
      }

      rslts = await plan.run(esql);
      rtn.rows = rslts.recordset;
      rtn.raw = rslts;
      const unprepare = plan.stmt ? async () => {
        if (dlt.at.stmts.has(meta.path)) {
          await dlt.at.stmts.get(meta.path).ps.unprepare();
          dlt.at.stmts.delete(meta.path);
        }
      } : null;
      if (unprepare) rtn.unprepare = unprepare;
      if (plan.txo && plan.txo.msTx) {
        if (rtn.unprepare) {
          plan.txo.unprepares = plan.txo.unprepares || new Map();
          plan.txo.unprepares.set(meta.path, rtn.unprepare); // keep track of the prepared statements that have transaction scope
        }
        if (opts.autoCommit) {
          await plan.txo.tx.commit();
        } else {
          dlt.at.state.pending++;
        }
      }

      return rtn;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to execute the following SQL at ${meta.path}:\n${sql}`, err);
      }
      err.sqler = {
        mssql: esql,
        inputBindTypes,
        outputBindTypes
      };
      throw err;
    }
  }

  /**
   * Gets the currently open execution plan or generates a new execution plan
   * (ensures transactions are ran in _series_ , even when user execution is in _parallel_)
   * @protected
   * @param {MSExecOptions} opts The execution options
   * @param {SQLERExecMeta} [meta] Pass meta to establish a connection
   * @returns {MSPlan} The execution plan
   */
  async planner(opts, meta) {
    const dlt = internal(this);
    const txId = opts.transactionId;
    /** @type {MSPlan} */
    const plan = {
      txo: txId ? dlt.at.txs.get(txId) : null
    };
    if (txId && !plan.txo) {
      plan.txo = {
        tx: {
          id: txId,
          state: Object.seal({
            isCommitted: false,
            isRolledback: false,
            pending: 0
          })
        },
        msTx: dlt.at.pool.transaction()
      };
      await plan.txo.msTx.begin(opts.isolationLevel);
      plan.txo.tx.commit = operation(dlt, 'commit', true, plan.txo, opts, 'unprepare');
      plan.txo.tx.rollback = operation(dlt, 'rollback', true, plan.txo, opts, 'unprepare');
      Object.freeze(plan.txo.tx);
      dlt.at.txs.set(plan.txo.tx.id, plan.txo);
    }
    if (!meta) return plan; // just initializing
    if (opts.prepareStatement) {
      plan.stmt = dlt.at.stmts.get(meta.path);
      if (plan.stmt) {
        let psErr;
        if (plan.stmt.txId && (!plan.txo || !plan.txo.msTx)) {
          psErr = new Error(`Prepared statement "${meta.path}" is already prepared within transaction "${plan.stmt.txId}".` +
            ` Either include the "transactionId" along with the current "prepareStatement = true" or call ` +
            `"unprepare" on the previous execution result before calling "${meta.path}" w/o a transaction.`);
          psErr.name = 'TransactionInProgressError';
        } else if (!plan.stmt.txId && plan.txo && plan.txo.msTx) {
          psErr = new Error(`Prepared statement "${meta.path}" is already prepared OUTSIDE of a transaction` +
            `, yet is currently being called within "transactionId = '${plan.txo.tx.id}'". Either include the "transactionId"` +
            ` along side the original "prepareStatement = true" or call "unprepare", "commit" or "rollback" on the` +
            ` previous execution result before calling "${meta.path}" with "transactionId = '${plan.txo.tx.id}'".`);
          psErr.name = 'TransactionNotInProgressError';
        } else if (plan.stmt.txId && plan.txo && plan.stmt.txId !== plan.txo.tx.id) {
          psErr = new Error(`Prepared statement "${meta.path}" is already prepared using "transactionId = '${plan.stmt.txId}'` +
            `, yet is currently being called with "transactionId = '${plan.txo.tx.id}'". Either include the same "transactionId"` +
            ` along side the all of the SQL function calls using "prepareStatement = true" or call "unprepare", "commit"` +
            ` or "rollback" on the previous execution result before calling "${meta.path}" with "transactionId = '${plan.txo.tx.id}'".`);
          psErr.name = 'TransactionMismatchError';
        }
        if (psErr) throw psErr;
      } else {
        dlt.at.stmts.set(meta.path, plan.stmt = {
          txId,
          ps: new dlt.at.driver.PreparedStatement((plan.txo && plan.txo.msTx) || dlt.at.pool)
        });
      }
    } else if (plan.txo && plan.txo.tx.id) {
      plan.req = plan.txo.msTx.request();
    } else {
      plan.req = dlt.at.pool.request();
    }
    // mssql ver >= 4 will not queue requests, need to manage them
    plan.run = async (sql) => {
      if (dlt.at.pends.length) await Promise.all(dlt.at.pends);
      let prom;
      if (plan.stmt) {
        prom = new Promise(async (resolve, reject) => {
          try {
            if (!plan.stmt.preparePromise) {
              plan.stmt.preparePromise = plan.stmt.ps.prepare(sql);
            }
            await plan.stmt.preparePromise;
            resolve(await plan.stmt.ps.execute(sql));
          } catch (err) { // may contain: err.precedingErrors
            reject(err);
          }
        });
      } else {
        prom = plan.req.query(sql);
      }
      dlt.at.pends.push(prom); // run in series for tx
      return prom.then(val => {
        const idx = dlt.at.pends.indexOf(prom);
        if (idx >= 0) dlt.at.pends.splice(idx, 1);
        return val;
      }, err => {
        const idx = dlt.at.pends.indexOf(prom);
        if (idx >= 0) dlt.at.pends.splice(idx, 1);
        throw err;
      });
    };
    return plan;
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
      if (dlt.at.pool) {
        await dlt.at.pool.close();
        dlt.at.txs.clear();
        dlt.at.stmts.clear();
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
   * @returns {SQLERState} The state
   */
  get state() {
    const dlt = internal(this);
    // mssql uses https://www.npmjs.com/package/tarn
    const pooled = dlt.at.pool;
    // mssql version >= 5.x:
    // pooled.pool.size -> pooled.size
    // pooled.pool.available -> pooled.available
    // pooled.pool.pending -> pooled.pending
    // pooled.pool.borrowed -> pooled.borrowed
    // pooled.pool.min
    // pooled.pool.max
    // pooled.used && pooled.used.length
    return {
      connection: {
        count: (pooled && pooled.pool && pooled.pool.max) || 0,
        inUse: ((pooled && pooled.pending) || 0) + ((pooled && pooled.borrowed) || 0)
      },
      pending: dlt.at.state.pending
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
 * Executes a function by name that resides on the vendor transaction
 * @private
 * @param {Object} dlt The internal dialect object instance
 * @param {String} name The name of the function that will be called on the transaction
 * @param {Boolean} reset Truthy to reset the pending transaction count when the operation completes successfully
 * @param {MSTransactionObject} txo The transaction object
 * @param {SQLERExecOptions} [opts] The {@link SQLERExecOptions}
 * @param {String} [preop] An operation name that will be performed before the actual operation. The following values are valid:
 * 1. __`unprepare`__ - Any un-prepare functions that are associated with the passed {@link MSTransactionObject} will be executed.
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(dlt, name, reset, txo, opts, preop) {
  return async () => {
    let ierr;
    if (preop === 'unprepare') {
      if (txo.unprepares) {
        for (let [ psname, unprepare ] of txo.unprepares) {
          if (dlt.at.logger) {
            dlt.at.logger(`sqler-mssql: Unpreparing prepared statement "${psname}"`);
          }
          await unprepare();
        }
        txo.unprepares.clear();
      }
    }
    try {
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-mssql: Performing ${name} on transaction "${txo.tx.id}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      await txo.msTx[name]();
      if (reset) { // not to be confused with pg connection.reset();
        dlt.at.txs.delete(txo.tx.id);
        dlt.at.state.pending = 0;
      }
    } catch (err) {
      ierr = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`sqler-mssql: Failed to ${name} ${dlt.at.state.pending} transaction(s) with options: ${
          opts ? JSON.stringify(opts) : 'N/A'}`, ierr);
      }
      throw ierr;
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

/**
 * MSSQL specific extension of the {@link SQLERConnectionOptions} from the [`sqler`](https://ugate.github.io/sqler/) module.
 * @typedef {SQLERConnectionOptions} MSConnectionOptions
 * @property {Object} driverOptions The `mssql` module specific options. __Both `client` and `pool` will be merged when generating the connection pool.__
 * @property {Object} [driverOptions.connection] An object that will contain properties/values that will be used to construct the MSSQL connections
 * (e.g. `{ database: 'mydb', requestTimeout: 10000 }`). See the `mssql` module documentation for a full listing of available connection options.
 * When a property value is a string surrounded by `${}`, it will be assumed to be a property that resides on either the {@link SQLERPrivateOptions}
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
 * MSSQL specific extension of the {@link SQLERExecOptions} from the [`sqler`](https://ugate.github.io/sqler/) module. When a property of `binds`
 * contains an object it will be _interpolated_ for property values on the `mssql` module.
 * For example, `binds.name = '${SOME_MSSQL_CONSTANT}'` will be interpolated as `binds.name = mssql.SOME_MSSQL_CONSTANT`.
 * @typedef {SQLERExecOptions} MSExecOptions
 * @property {Object} [driverOptions] The `mssql` module specific options pertaining executions
 * @property {Object} [driverOptions.inputBindTypes] An object that contains properties that match the bind parameter names. Each property should contain a value
 * that corresponds to a `mssql` module specific bind type. Each bind type will result in a call to either `mssql.Request.input`, `mssql.PreparedStatement.input`.
 * __When using `preparedStatement = true`, input bind types are required.__
 * When a property value is a string surrounded by `${}`, it will be assumed to be a property that resides on the `mssql` module itself. For example,
 * `driverOptions.inputBindTypes.name = '${VarChar}'` would be interpolated into `driverOptions.inputBindTypes.name = mssql.VarChar`.
 *  @property {Object} [driverOptions.outputBindTypes] An object that contains properties that match the bind parameter names. Each property should contain a value
 * that corresponds to a `mssql` module specific bind type. Each bind type will result in a call to either `mssql.Request.output`, `mssql.PreparedStatement.output`.
 * When a property value is a string surrounded by `${}`, it will be assumed to be a property that resides on the `mssql` module itself. For example,
 * `driverOptions.outputBindTypes.name = '${VarChar}'` would be interpolated into `driverOptions.outputBindTypes.name = mssql.VarChar`.
 */

/**
 * 
 * @typedef {SQLERTransactionOptions} MSTransactionOptions
 * @property {Object} [driverOptions] The `mssql` module specific options pertaining to transations
 * @property {String} [driverOptions.isolationLevel] Controls the locking and row versioning behavior of MSSQL statements issued by a connection.
 * When a property value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `mssql` module within
 * `mssql.ISOLATION_LEVEL` and will be interpolated accordingly.
 * For example `driverOptions.isolationLevel = ${SERIALIZABLE}` will be interpolated to `driverOptions.isolationLevel = mssql.ISOLATION_LEVEL.SERIALIZABLE`.
 */

/**
 * Transactions are wrapped in a parent transaction object so private properties can be added
 * @typedef {Object} MSTransactionObject
 * @property {SQLERTransaction} tx The transaction
 * @property {Obejct} msTx The MSSQL transaction
 */

/**
 * Prepared statements are wrapped in a parent prepared statement object so private properties can be added
 * @typedef {Object} MSPreparedStatement
 * @property {Object} ps The MSSQL prepared statement
 * @property {String} [txId] The transaction that the prepared statement is participating in (if any)
 */

/**
 * Transactions are wrapped in a parent transaction object so private properties can be added
 * @typedef {Object} MSPlan
 * @property {MSTransactionObject} [txo] The transaction object
 * @property {MSPreparedStatement} [stmt] The prepared statement object (undefined when none)
 * @property {Object} [req] The MSSQL request (undefined when using only prepared statement(s))
 * @property {MSPlanRunner} [run] The SQL executor for the plan
 */

/**
 * Will either _prepare_/_execute_ the passed SQL or _query_ the passed SQL
 * @callback {Function} MSPlanRunner
 * @async
 * @param {String} sql The SQL statement that contains the bind parameters
 */