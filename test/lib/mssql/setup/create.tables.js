'use strict';

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  // create the tables (in parallel)
  return Promise.all([
    manager.db[connName].setup.create.table1(),
    manager.db[connName].setup.create.table2()
  ]);
};