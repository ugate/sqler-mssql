// assuming "conf" contains combined "univ" and "db" objects from above

// create/initialize manager
const manager = new Manager(conf);
await manager.init();

// see subsequent examples for different examples
const result = await runExample(manager, 'mssql');

console.log('Result:', result);

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await manager.close();
  console.log('Manager has been closed');
});