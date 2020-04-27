'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('sqler');
const Path = require('path');
const Fs = require('fs');
const Os = require('os');
const { expect } = require('@hapi/code');
const readChunk = require('read-chunk');
const imageType = require('image-type');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from 'sqler.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import * as Os from 'os';
// TODO : import { expect } from '@hapi/code';
// TODO : import * as readChunk from 'readChunk';
// TODO : import * as imageType from 'imageType';

const priv = {
  mgr: null,
  cache: null,
  rowCount: 2,
  mgrLogit: !!LOGGER.info,
  vendor: 'mssql',
  defaultPort: 5432,
  conf: {}
};

// TODO : ESM uncomment the following line...
// export
class Tester {

  /**
   * Create table(s) used for testing
   */
  static async before() {
    priv.ci = 'CI' in process.env;
    Labrat.header(`${priv.vendor}: Creating test tables (if any)${priv.ci ? ` CI=${priv.ci}` : ''}`);
    
    const conf = getConf();
    priv.cache = null;
    priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    await priv.mgr.init();
    
    if (priv.mgr.db[priv.vendor].setup) {
      const createDB = getCrudOp('create', priv.vendor, 'database', true);
      await createDB(priv.mgr, priv.vendor);
      const createTB = getCrudOp('create', priv.vendor, 'tables', true);
      await createTB(priv.mgr, priv.vendor);
    }
    priv.created = true;
  }

  /**
   * Drop table(s) used for testing
   */
  static async after() {
    if (!priv.created) {
      Labrat.header(`${priv.vendor}: Skipping dropping of test tables/database`);
      return;
    }
    Labrat.header(`${priv.vendor}: Dropping test tables/database (if any)`);
    
    const conf = getConf();
    priv.cache = null;
    if (!priv.mgr) {
      priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
      await priv.mgr.init();
    }
    
    try {
      if (priv.mgr.db[priv.vendor].setup) {
        const deleteTB = getCrudOp('delete', priv.vendor, 'tables', true);
        await deleteTB(priv.mgr, priv.vendor);
        const deleteDB = getCrudOp('delete', priv.vendor, 'database', true);
        await deleteDB(priv.mgr, priv.vendor);
      }
      priv.created = false;
    } catch (err) {
      if (LOGGER.warn) LOGGER.warn(`${priv.vendor}: Failed to delete tables/database${priv.ci ? ` (CI=${priv.ci})` : ''}`, err);
      throw err;
    }
    return priv.mgr.close();
  }

  /**
   * Start cache (if present)
   */
  static async beforeEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.start) await cch.start();
  }

  /**
   * Stop cache (if present)
   */
  static async afterEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.stop) await cch.stop();
  }

  //======================== Executions ========================

  /**
   * Test CRUD operations for a specified `priv.vendor` and `priv.mgr`
   */
  static async crud() {
    Labrat.header(`${priv.vendor}: Running CRUD tests`, 'info');
    const rslts = new Array(3);
    let rslti = -1, lastUpdated;

    // expect CRUD results
    const crudly = (rtn, label, nameIncl, count = 2) => {
      const rslts = Array.isArray(rtn) ? rtn : [rtn];
      let cnt = 0, updated;
      for (let rslt of rslts) {
        if (!rslt.rows) continue;
        expect(rslt.rows, `CRUD ${label} rows`).array();
        if (!label.includes('read')) continue;
        cnt++;
        expect(rslt.rows, `CRUD ${label} rows.length`).length(count);
        for (let row of rslt.rows) {
          expect(row, `CRUD ${label} row`).object();
          if (nameIncl) expect(row.name, `CRUD ${label} row.name`).includes(nameIncl);
          updated = new Date(row.updated) || row.updated;
          expect(updated, `CRUD ${label} row.updated`).date();
          if (lastUpdated) expect(updated, `CRUD ${label} row.updated > lastUpdated`).greaterThan(lastUpdated);
          // expect binary report image
          if (row.report) {
            expect(row.report, 'row.report').to.be.buffer();
            if (row.reportPath) {
              const reportBuffer = readChunk.sync(row.reportPath, 0, 12);
              const reportType = imageType(reportBuffer);
              expect(reportType, 'row.report Image Type').to.be.object();
              expect(reportType.mime, 'row.report Image Mime-Type').to.equal('image/png');
            }
          }
        }
      }
      if (cnt > 0) lastUpdated = updated;
    };

    let create, read, update, del;

    create = getCrudOp('create', priv.vendor, 'table.rows');
    rslts[++rslti] = await create(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'create');
  
    read = getCrudOp('read', priv.vendor, 'table.rows');
    rslts[++rslti] = await read(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'read', 'TABLE');

    update = getCrudOp('update', priv.vendor, 'table.rows');
    rslts[++rslti] = await update(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'update');
  
    rslts[++rslti] = await read(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'update read', 'UPDATE');
  
    del = getCrudOp('delete', priv.vendor, 'table.rows');
    rslts[++rslti] = await del(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'delete');
  
    rslts[++rslti] = await read(priv.mgr, priv.vendor);
    crudly(rslts[rslti], 'delete read', null, 0);

    if (LOGGER.debug) LOGGER.debug(`CRUD ${priv.vendor} execution results:`, ...rslts);
    Labrat.header(`${priv.vendor}: Completed CRUD tests`, 'info');
    return rslts;
  }

  static async execDriverOptionsAlt() {
    const id = 400, name = 'TEST ALT', date = new Date();
    let created, rslt;
    try {
      created = await priv.mgr.db[priv.vendor].create.table1.rows({
        binds: {
          id, name, created: date, updated: date
        },
        driverOptions: {
          query: {
            name: true // use internal stored procedure name
          }
        }
      });
      rslt = await priv.mgr.db[priv.vendor].read.table.rows({
        binds: { name },
        driverOptions: {
          query: {
            rowMode: 'array'
          }
        }
      });
    } finally {
      if (created) {
        await priv.mgr.db[priv.vendor].delete.table1.rows({
          binds: { id }
        });
      }
    }

    if (rslt) { // ensure the results are in array format from rowMode
      expect(rslt.rows, 'alt rslt.rows').to.be.array();
      expect(rslt.rows, 'alt rslt.rows').to.have.length(1);
      expect(rslt.rows[0], 'alt rslt.rows[0]').to.be.array();
      expect(rslt.rows[0], 'alt rslt.rows[0]').to.have.length(5);
      expect(rslt.rows[0][0], 'alt rslt.rows[0][0] (id)').to.equal(id);
      expect(rslt.rows[0][1], 'alt rslt.rows[0][1] (name)').to.equal(name);
      expect(rslt.rows[0][2], 'alt rslt.rows[0][2] (report)').to.be.null();
      expect(rslt.rows[0][3], 'alt rslt.rows[0][3] (created)').to.equal(date);
      expect(rslt.rows[0][4], 'alt rslt.rows[0][4] (updated)').to.equal(date);
    }
  }

  static async sqlInvalidThrow() {
    return priv.mgr.db[priv.vendor].error.update.non.exist({}, ['error']);
  }

  static async bindsInvalidThrow() {
    const date = new Date();
    return priv.mgr.db[priv.vendor].create.table.rows({
      binds: {
        id: 500, name: 'SHOULD NEVER GET INSERTED', created: date, updated: date,
        id2: 500, name2: 'SHOULD NEVER GET INSERTED', /* report2 missing should throw error */ created2: date, updated2: date
      }
    });
  }

  //====================== Configurations ======================

  static async initThrow() {
    // need to set a conf override to prevent overwritting of privateConf.username
    const conf = getConf({ pool: null });
    conf.univ.db[priv.vendor].username = 'invalid';
    conf.univ.db[priv.vendor].password = 'invalid';
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    await mgr.init();
    return mgr.close();
  }

  static async poolNone() {
    const conf = getConf({ pool: null, connection: null });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    await mgr.init();
    return mgr.close();
  }

  static async poolPropSwap() {
    const conf = getConf({
      pool: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        if (conn[prop].hasOwnProperty('max')) {
          delete conn[prop].max;
        } else {
          conn[prop].max = 10;
        }
        if (conn[prop].hasOwnProperty('min')) {
          delete conn[prop].min;
        } else {
          conn[prop].min = conn[prop].hasOwnProperty('max') ? conn[prop].max : 10;
        }
        if (conn[prop].hasOwnProperty('idle')) {
          delete conn[prop].idle;
        } else {
          conn[prop].idle = 1800;
        }
        if (conn[prop].hasOwnProperty('timeout')) {
          delete conn[prop].timeout;
        } else {
          conn[prop].timeout = 10000;
        }
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsNoneThrow() {
    const conf = getConf({ driverOptions: null });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsPoolConnNone() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        conn[prop].pool = null;
        conn[prop].connection = null;
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsPoolConnSwap() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        if (conn[prop].pool && !conn[prop].connection) {
          conn[prop].connection = conn[prop].pool;
          conn[prop].pool = null;
        } else if (!conn[prop].pool && conn[prop].connection) {
          conn[prop].pool = conn[prop].connection;
          conn[prop].connection = null;
        } else {
          conn[prop].pool = {};
          conn[prop].connection = {};
        }
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsNamedPlaceholdersSwap() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        const cont = conn[prop].pool || conn[prop].connection || {};
        cont.namedPlaceholders = !cont.namedPlaceholders;
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsClient() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        conn[prop].client = conn[prop].client || {};
        conn[prop].client.query_timeout = conn[prop].client.query_timeout || 100;
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    await mgr.init();
    return mgr.close();
  }

  static async hostPortSwap() {
    // need to set a conf override to prevent overwritting of privateConf properties for other tests
    const conf = getConf({ pool: null });
    if (conf.univ.db[priv.vendor].host) {
      delete conf.univ.db[priv.vendor].host;
    } else {
      conf.univ.db[priv.vendor].host = "localhost";
    }
    if (conf.univ.db[priv.vendor].hasOwnProperty('port')) {
      delete conf.univ.db[priv.vendor].port;
    } else {
      conf.univ.db[priv.vendor].port = priv.defaultPort;
    }
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async multipleConnections() {
    const conf = getConf();
    const conn = JSON.parse(JSON.stringify(conf.db.connections[0]));
    conn.name += '2';
    conf.db.connections.push(conn);
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async closeBeforeInit() {
    const conf = getConf();
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    return mgr.close();
  }

  static async state() {
    const poolCount = 4;
    const conf = getConf({
      pool: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        conn[prop].min = conn[prop].max = poolCount;
      }
    });
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
    await mgr.init();

    const state = await mgr.state();
    expect(state, 'state').to.be.object();
    expect(state.result, 'state.result').to.be.object();
    expect(state.result[priv.vendor], `state.result.${priv.vendor}`).to.be.object();
    expect(state.result[priv.vendor].pending, `state.result.${priv.vendor}.pending`).to.equal(0);
    expect(state.result[priv.vendor].connection, `state.result.${priv.vendor}.connection`).to.be.object();
    expect(state.result[priv.vendor].connection.count, `state.result.${priv.vendor}.connection.count`).to.equal(poolCount);
    expect(state.result[priv.vendor].connection.inUse, `state.result.${priv.vendor}.connection.inUse`).to.equal(0);

    return mgr.close();
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

/**
 * Generates a configuration
 * @param {Object} [overrides] The connection configuration override properties. Each property will be deleted from the returned
 * connection configuration when falsy. When the property value is an function, the `function(propertyName, connectionConf)` will
 * be called (property not set by the callee). Otherwise, the property value will be set on the configuration.
 * @returns {Object} The configuration
 */
function getConf(overrides) {
  let conf = priv.conf[priv.vendor];
  if (!conf) {
    conf = priv.conf[priv.vendor] = JSON.parse(Fs.readFileSync(Path.join(`test/fixtures/${priv.vendor}`, `conf${priv.ci ? '-ci' : ''}.json`), 'utf8'));
    if (!priv.univ) {
      priv.univ = JSON.parse(Fs.readFileSync(Path.join('test/fixtures', `priv${priv.ci ? '-ci' : ''}.json`), 'utf8')).univ;
    }
    conf.univ = priv.univ;
    conf.mainPath = 'test';
    conf.db.dialects.mssql = './test/dialects/test-dialect.js';
  }
  if (overrides) {
    const confCopy = JSON.parse(JSON.stringify(conf));
    for (let dlct in conf.db.dialects) {
      confCopy.db.dialects[dlct] = conf.db.dialects[dlct];
    }
    conf = confCopy;
  }
  let exclude;
  for (let conn of conf.db.connections) {
    for (let prop in conn) {
      if (!conn.hasOwnProperty(prop)) continue;
      exclude = overrides && overrides.hasOwnProperty(prop);
      if (exclude) {
        if (typeof overrides[prop] === 'function') overrides[prop](prop, conn);
        else if (overrides[prop]) conn[prop] = overrides[prop];
        else delete conn[prop];
      } else if (prop === 'pool') {
        conn.pool.min = Math.floor((process.env.UV_THREADPOOL_SIZE - 1) / 2) || 2;
        conn.pool.max = process.env.UV_THREADPOOL_SIZE ? process.env.UV_THREADPOOL_SIZE - 1 : conn.pool.min;
        conn.pool.increment = 1;
        if (!overrides) return conf; // no need to continue since there are no more options that need to be set manually
      }
    }
  }
  return conf;
}

/**
 * Gets the `async function` that will execute a CRUD operation
 * @param {String} cmd The command name of the CRUD operation (e.g. `create`, `read`, etc.)
 * @param {String} vendor The vendor to use (e.g. `oracle`, `mssql`, etc.)
 * @param {String} key Key that indicates the file name (w/o extension)
 * @param {Boolean} [isSetup] Truthy when the CRUD operation is for a setup operation (e.g. creating/dropping tables)
 * @returns {Function} The `async function(manager)` that will return the CRUD results
 */
function getCrudOp(cmd, vendor, key, isSetup) {
  const base = Path.join(process.cwd(), `test/lib/${vendor}${isSetup ? '/setup' : ''}`);
  const pth = Path.join(base, `${cmd}.${key}.js`);
  return require(pth);
}

/**
 * Generate a test logger that just consumes logging
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateTestAbyssLogger() {
  return function testAbyssLogger() {};
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  // ensure unhandled rejections puke with a non-zero exit code
  process.on('unhandledRejection', up => { throw up });
  // run the test(s)
  (async () => await Labrat.run(Tester))();
}