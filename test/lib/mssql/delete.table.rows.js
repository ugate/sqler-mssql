'use strict';

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const rtn = new Array(2);

  // delete rows (implicit transactions)
  rtn[0] = await manager.db[connName].delete.table1.rows({
    binds: { id: 1 }
  });
  rtn[1] = await manager.db[connName].delete.table2.rows({
    binds: { id2: 1 }
  });

  return rtn;
};