'use strict';

const Os = require('os');
const Fs = require('fs');

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  // read from multiple tables
  const rslt = await manager.db[connName].read.table.rows({ binds: { name: 'table' } });

  // write binary report buffer to file?
  const writeProms = [];
  for (let row of rslt.rows) {
    if (row.report) {
      // store the path to the report (illustrative purposes only)
      row.reportPath = `${Os.tmpdir()}/sqler-${connName}-read-${row.id}.png`;
      writeProms.push(Fs.promises.writeFile(row.reportPath, row.report));
    }
  }
  if (writeProms.length) {
    await Promise.all(writeProms);
  }

  return rslt;
};