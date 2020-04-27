'use strict';

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  // delete the tables (in parallel)
  return Promise.all([
    manager.db[connName].setup.delete.table1(),
    manager.db[connName].setup.delete.table2()
  ]);
};