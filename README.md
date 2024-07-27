# cyberfly-node
Storage node for cyberfly IoT platform


### Create DB address

POST /api/createdb

```javascript

{"dbinfo":{"name":"dashboard", "dbtype":"documents"}. "sig":"signed signature", "pubkey":"pubkey used to sign the dbinfo"}
```
