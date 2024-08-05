# cyberfly-node
Storage node for cyberfly IoT platform


### Create DB address

POST /api/createdb

```json

{
"dbinfo":{"name":"dashboard", "dbtype":"documents"}, 
"sig":"signature", 
"pubkey":"pubkey used to sign the dbinfo"
}
```

### add data to db

POST /api/data

```json

{
"data":{"temp":25}, 
"sig":"signature", 
"publicKey":"pubkey used to sign the data", 
"dbaddr":"db address"
}
```


### update data to db

```json

{
"_id":"id of existing data",
"data":{"temp":26}, 
"sig":"signature", 
"publicKey":"pubkey used to sign the data", 
"dbaddr":"db address"
}
```

### read all data from db

POST /api/read

```json

{
"dbaddress":"/orbitdb/address"
}
```

### get a record from db

POST /api/getdata

```json

{
"dbaddress":"/orbitdb/address",
"key":"valid key of the existing record"
}
```