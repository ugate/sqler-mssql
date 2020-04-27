### ⚙️ Setup &amp; Configuration <sub id="conf"></sub>:

> __Most of documentation pertaining to general configuration for `sqler-mssql` can be found in the [`sqler` manual](https://ugate.github.io/sqler).__

The following modules versions are required when using `sqler-mssql` for [SQL Server](https://www.microsoft.com/en-us/sql-server):
```jsdocp ./package.json @~ devDependencies.sqler @~ devDependencies.mssql
```

Install the required modules:
```sh
npm install sqler
npm install sqler-mssql
npm install mssql
```

Connection and execution option extensions can be found under the API docs for [globals](global.html).

### 💡 [SQL Server Usage](tutorial-2-usage.html)