'use strict';

const Os = require('os');
const Fs = require('fs');

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  // read from multiple tables
  const rslt = await manager.db[connName].read.table.rows({ binds: { name: 'table' } });

  // write binary report buffer to file?
  let report;
  const writeProms = [];
  for (let row of rslt.rows) {
    if (row.report) {
      // convert the hex encoded varbinary into ascii
      report = '';
      for (let i = 0; i < row.report.length; i += 2) {
        report += String.fromCharCode(parseInt(row.report.substr(i, 2), 16));
      }
      //report = Buffer.from(row.report, 'hex').toString('utf8');
      // store the path to the report (illustrative purposes only)
      row.reportPath = `${Os.tmpdir()}/sqler-${connName}-read-${row.id}.png`;
      writeProms.push(Fs.promises.writeFile(row.reportPath, report));
    }
  }
  if (writeProms.length) {
    await Promise.all(writeProms);
  }

  return rslt;
};