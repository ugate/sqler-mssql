'use strict';

const MSDialect = require('../../index');
const { expect } = require('@hapi/code');

/**
* Test SQL Server database {@link Dialect}
*/
module.exports = class MSTestDialect extends MSDialect {

  /**
   * @inheritdoc
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    super(priv, connConf, track, errorLogger, logger, debug);

    this.track = track;

    expect(priv, 'priv').to.be.object();

    expect(connConf, 'connConf').to.be.object();

    expect(connConf.username || priv.username, 'priv.username').to.be.string();
    expect(connConf.username || priv.username, 'priv.username.length').to.not.be.empty();

    expect(connConf.id, 'connConf.id').to.be.string();
    expect(connConf.id, 'connConf.id.length').to.not.be.empty();
    expect(connConf.name, 'connConf.name').to.be.string();
    expect(connConf.name, 'connConf.name.length').to.not.be.empty();
    expect(connConf.dir, 'connConf.dir').to.be.string();
    expect(connConf.dir, 'connConf.dir.length').to.not.be.empty();
    expect(connConf.service, 'connConf.service').to.be.string();
    expect(connConf.service, 'connConf.service.length').to.not.be.empty();
    expect(connConf.dialect, 'connConf.dialect === mssql').to.equal('mssql');

    expectDriverOptions(connConf, this);

    expect(track, 'track').to.be.object();
    if (errorLogger) expect(errorLogger, 'errorLogger').to.be.function();
    if (logger) expect(logger, 'logger').to.be.function();
    expect(debug, 'debug').to.be.boolean();
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    const pool = await super.init(opts);

    return pool;
  }

  /**
   * @inheritdoc
   */
  async beginTransaction(txId, opts) {
    expect(txId, 'transaction identifier').to.be.string();
    expect(txId, 'transaction identifier').to.not.be.empty();
    expect(opts, 'transaction options').to.be.object();

    if (opts.hasOwnProperty('isolationLevel')) {
      const topts = this.track.interpolate({}, opts, this.driver.ISOLATION_LEVEL);
      expect(topts.isolationLevel, 'opts.isolationLevel').to.be.number();
    }

    return super.beginTransaction(txId, opts);
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    expect(sql, 'sql').to.be.string();

    expect(opts, 'opts').to.be.object();

    const state = super.state;
    expect(state, 'dialect.state').to.be.object();
    expect(state.pending, 'dialect.state.pending').to.be.number();
    expect(state.connection, 'dialect.connection').to.be.object();
    expect(state.connection.count, 'dialect.connection.count').to.be.number();
    expect(state.connection.inUse, 'dialect.connection.inUse').to.be.number();



    expect(meta, 'meta').to.be.object();
    expect(meta.name, 'meta.name').to.be.string();
    expect(meta.name, 'meta.name').to.not.be.empty();
    expect(meta.path, 'meta.path').to.be.string();
    expect(meta.path, 'meta.path').to.not.be.empty();

    return super.exec(sql, opts, frags, meta, errorOpts);
  }

  /**
   * @inheritdoc
   */
  async close() {
    return super.close();
  }
};

/**
 * Expects the SQL Server driver options (when present)
 * @param {Manager~ConnectionOptions} opts The connection options to check
 * @param {MSTestDialect} dlt The test dialect
 */
function expectDriverOptions(opts, dlt) {
  expect(dlt.driver, `${dlt.constructor.name} driver`).to.be.object();
  if (!opts.driverOptions) return;
  expect(opts.driverOptions, 'connConf.driverOptions').to.be.object();
}