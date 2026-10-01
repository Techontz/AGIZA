"""
MySQL driver. Deployments use PyMySQL (pure Python: installs on shared hosting without
compiler tools or Python headers). It registers itself as `MySQLdb`, the module Django's
MySQL backend imports. This runs before settings load, since `config.settings.*` imports
this package first. Without PyMySQL, mysqlclient (if installed) is used as before.
"""
try:
    import pymysql
except ImportError:  # PostgreSQL deployments, or mysqlclient installed instead
    pass
else:
    pymysql.install_as_MySQLdb()
