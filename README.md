# cyberfly-node
Storage node for cyberfly IoT platform


### Create DB address

POST /api/createdb

```javascript

{"dbinfo":{"name":"dashboard", "dbtype":"documents"}. "sig":"signed signature", "pubkey":"pubkey used to sign the dbinfo"}
```

### add data to db

```javascript

{"data":{}. "sig":"signed signature", "pubkey":"pubkey used to sign the data", "dbaddr":"db address"}
```


### update data to db

```javascript

{"_id":"id of existing data","data":{}. "sig":"signed signature", "pubkey":"pubkey used to sign the data", "dbaddr":"db address"}
```