'use strict';

const Fs = require('fs');

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const date = new Date(), rtn = new Array(2);
  // The driver module currently doesn't support Fs.ReadStream/Fs.createReadStream()
  const report = await Fs.promises.readFile('./test/files/audit-report.png');

  // Insert rows (implicit transactions)
  rtn[0] = await manager.db[connName].create.table1.rows({
    binds: {
      id: 1, name: 'TABLE: 1, ROW: 1', created: date, updated: date
    }
  });
  rtn[1] = await manager.db[connName].create.table2.rows({
    binds: {
      id2: 1, name2: 'TABLE: 2, ROW: 1', report2: report, created2: date, updated2: date
    }
  });

  return rtn;
};