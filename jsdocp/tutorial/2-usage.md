### 💡 [SQL Server](https://www.microsoft.com/en-us/sql-server) Examples:

#### Examples:<sub id="examples"></sub>

The examples below use the following setup:

__[Private Options Configuration:](https://ugate.github.io/sqler/Manager.html#~PrivateOptions)__ (appended to the subsequent connection options)
```jsdocp ./test/fixtures/priv.json
```

__[Connection Options Configuration:](global.html#MSConnectionOptions)__
```jsdocp ./test/fixtures/mssql/conf.json
```

Test code that illustrates how to use SQL Server with various examples
```jsdocp ./test/fixtures/run-example.js
```

__Create Schema:__

```jsdocp ./test/db/mssql/setup/create.database.sql
-- db/mssql/setup/create.database.sql
```

```jsdocp ./test/lib/mssql/setup/create.database.js
```

__Create Table(s):__

```jsdocp ./test/db/mssql/setup/create.table1.sql
-- db/mssql/setup/create.table1.sql
```
```jsdocp ./test/db/mssql/setup/create.table2.sql
-- db/mssql/setup/create.table2.sql
```

```jsdocp ./test/lib/mssql/setup/create.tables.js
```

__Create Rows:__

```jsdocp ./test/db/mssql/create.table1.rows.sql
-- db/mssql/create.table1.rows.sql
```
```jsdocp ./test/db/mssql/create.table2.rows.sql
-- db/mssql/create.table2.rows.sql
```

```jsdocp ./test/lib/mssql/create.table.rows.js
```

__Read Rows:__

```jsdocp ./test/db/mssql/read.table.rows.sql
-- db/mssql/read.table.rows.sql
```

```jsdocp ./test/lib/mssql/read.table.rows.js
```

__Update Rows:__

```jsdocp ./test/db/mssql/update.table1.rows.sql
-- db/mssql/update.table1.rows.sql
```
```jsdocp ./test/db/mssql/update.table2.rows.sql
-- db/mssql/update.table2.rows.sql
```

```jsdocp ./test/lib/mssql/update.table.rows.js
```

__Delete Rows:__

```jsdocp ./test/db/mssql/delete.table1.rows.sql
-- db/mssql/delete.table1.rows.sql
```
```jsdocp ./test/db/mssql/delete.table2.rows.sql
-- db/mssql/delete.table2.rows.sql
```

```jsdocp ./test/lib/mssql/delete.table.rows.js
```

__Delete Tables:__

```jsdocp ./test/db/mssql/setup/delete.table1.sql
-- db/mssql/setup/delete.table1.sql
```
```jsdocp ./test/db/mssql/setup/delete.table2.sql
-- db/mssql/setup/delete.table2.sql
```

```jsdocp ./test/lib/mssql/setup/delete.tables.js
```

__Delete Schema:__

```jsdocp ./test/db/mssql/setup/delete.database.sql
-- db/mssql/setup/delete.database.sql
```

```jsdocp ./test/lib/mssql/setup/delete.database.js
```